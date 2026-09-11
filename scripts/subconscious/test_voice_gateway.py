"""Verify native voice authentication across the Vercel and AWS boundary.

Set VOICE_FRONTEND_URL, VOICE_GATEWAY_URL, VOICE_BROWSER_ORIGIN and
VOICE_COOKIE_JAR. No audio, chat messages or customer records are written.
"""
import http.cookiejar
import json
import os
import unittest
from urllib.request import Request, urlopen
from websockets.sync.client import connect
from websockets.exceptions import InvalidStatus


class VoiceGatewayTest(unittest.TestCase):
    def token(self):
        jar = http.cookiejar.MozillaCookieJar(os.environ['VOICE_COOKIE_JAR'])
        jar.load(ignore_discard=True, ignore_expires=True)
        request = Request(
            os.environ['VOICE_FRONTEND_URL'].rstrip('/') + '/api/voice/ws-token',
            headers={'Cookie': '; '.join(f'{c.name}={c.value}' for c in jar)},
            method='POST',
        )
        with urlopen(request, timeout=30) as response:
            return json.load(response)['token']

    def connection(self, stream, token, origin):
        return connect(
            os.environ['VOICE_GATEWAY_URL'].rstrip('/') + f'/voice/{stream}/stream?token={token}',
            origin=origin, open_timeout=15,
        )

    def test_review_origin_reaches_native_voice_and_token_cannot_replay(self):
        for stream in ('transcribe', 'synthesize'):
            token = self.token()
            with self.connection(stream, token, os.environ['VOICE_BROWSER_ORIGIN']) as socket:
                # Native accept proves auth. No provider is needed for the transport gate.
                self.assertEqual(socket.response.status_code, 101)
            with self.assertRaises(InvalidStatus) as rejected:
                self.connection(stream, token, os.environ['VOICE_BROWSER_ORIGIN'])
            self.assertEqual(rejected.exception.response.status_code, 403)

    def test_wrong_origin_and_missing_auth_are_rejected(self):
        for origin, token in (("https://untrusted.example", self.token()),
                              (os.environ['VOICE_BROWSER_ORIGIN'], 'invalid')):
            with self.assertRaises(InvalidStatus) as rejected:
                self.connection('transcribe', token, origin)
            self.assertEqual(rejected.exception.response.status_code, 403)


if __name__ == '__main__':
    unittest.main()
