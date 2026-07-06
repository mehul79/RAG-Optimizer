import tiktoken

_enc = None


def _get_enc():
    global _enc
    if _enc is None:
        _enc = tiktoken.get_encoding("cl100k_base")
    return _enc


class FixedChunker:
    def __init__(self, chunk_size: int = 512, overlap: int = 0):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk(self, text: str) -> list[str]:
        tokens = _get_enc().encode(text)
        chunks = []
        start = 0
        while start < len(tokens):
            end = min(start + self.chunk_size, len(tokens))
            chunks.append(_get_enc().decode(tokens[start:end]))
            if end == len(tokens):
                break
            start += self.chunk_size - self.overlap
        return chunks
