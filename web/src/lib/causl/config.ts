/** Only exact configured origins can embed the workspace route. Invalid configuration fails closed. */
export function causlEmbedOrigins(): string[] {
  const setting = process.env.CAUSL_KB_EMBED_ORIGINS ?? "";
  if (!setting || setting.length > 8192) return [];
  const values = setting.split(",").map((value) => value.trim());
  if (values.length > 10) return [];
  try {
    return values.every((value) => {
      const url = new URL(value);
      return (
        url.origin === value &&
        !url.hostname.includes("*") &&
        !url.username &&
        !url.password &&
        (url.protocol === "https:" ||
          (url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
      );
    })
      ? [...new Set(values)]
      : [];
  } catch {
    return [];
  }
}
