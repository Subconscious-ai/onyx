import threading
from queue import Queue

from onyx.server.query_and_chat.placement import Placement
from onyx.server.query_and_chat.streaming_models import Packet


class Emitter:
    """Routes packets from LLM/tool execution to the ``_run_models`` drain loop.

    Tags every packet with ``model_index`` and places it on ``merged_queue``
    as a ``(model_idx, packet)`` tuple for ordered consumption downstream.

    Args:
        merged_queue: Shared queue owned by ``_run_models``.
        model_idx: Index embedded in packet placements (``0`` for N=1 runs).
        drain_done: Optional event set by ``_run_models`` when the drain loop
            exits early (e.g. HTTP disconnect). When set, ``emit`` returns
            immediately so worker threads can exit fast.
        interactive: True only when a person is watching this stream in a
            browser and can answer a question put to them (a tool server's
            request for approval). The non-streaming API, Slack and evals run
            the same pipeline with nobody to answer.
    """

    def __init__(
        self,
        merged_queue: Queue[tuple[int, Packet | Exception | object]],
        model_idx: int = 0,
        drain_done: threading.Event | None = None,
        interactive: bool = False,
    ) -> None:
        self._model_idx = model_idx
        self._merged_queue = merged_queue
        self._drain_done = drain_done
        self._interactive = interactive

    @property
    def is_live(self) -> bool:
        """True while a person is watching this stream and has not stopped it.

        False for an emitter nobody watches (a sub-agent's private queue, the
        non-streaming API, Slack, evals) and once the user stopped the stream.
        """
        return (
            self._interactive
            and self._drain_done is not None
            and not self._drain_done.is_set()
        )

    def emit(self, packet: Packet) -> None:
        if self._drain_done is not None and self._drain_done.is_set():
            return
        base = packet.placement or Placement(turn_index=0)
        tagged = Packet(
            placement=base.model_copy(update={"model_index": self._model_idx}),
            obj=packet.obj,
        )
        self._merged_queue.put((self._model_idx, tagged))


class NullEmitter(Emitter):
    """Emitter that silently discards all packets.

    Used by callers that run tools outside the chat streaming context
    (e.g. the Search API, MCP server).
    """

    def __init__(self) -> None:
        self._model_idx = 0
        self._merged_queue = None
        self._drain_done = None
        self._interactive = False

    def emit(self, packet: Packet) -> None:
        pass
