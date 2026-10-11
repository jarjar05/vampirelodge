"""Split documents into overlapping chunks small enough for the embedding model to read in full."""

import re

# The default embedding model (all-MiniLM-L6-v2) reads about 256 tokens and silently ignores the rest.
# 900 characters stays under that for ordinary prose, so every part of a document is searchable.
MAX_CHUNK_CHARS = 900
# Repeated at the start of the next chunk so a fact split across a boundary is still found.
OVERLAP_CHARS = 120

_PARAGRAPH_BREAK = re.compile(r"\n\s*\n")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def _split_long(text: str, limit: int) -> list[str]:
    """Break one over-long block at sentence ends, then at spaces, then mid-word as a last resort."""
    pieces: list[str] = []
    for sentence in _SENTENCE_END.split(text):
        while len(sentence) > limit:
            cut = sentence.rfind(" ", 0, limit)
            cut = cut if cut > limit // 2 else limit
            pieces.append(sentence[:cut].strip())
            sentence = sentence[cut:].strip()
        if sentence:
            pieces.append(sentence)
    return pieces


def chunk_text(text: str, max_chars: int = MAX_CHUNK_CHARS, overlap_chars: int = OVERLAP_CHARS) -> list[str]:
    """Return the text as chunks of at most `max_chars`, preferring paragraph and sentence boundaries."""
    normalized = text.replace("\r\n", "\n").strip()
    if not normalized:
        return []
    if len(normalized) <= max_chars:
        return [normalized]

    # Leave room for the overlap and the blank line that joins it to the chunk.
    body_limit = max_chars - overlap_chars - 2
    units: list[str] = []
    for paragraph in _PARAGRAPH_BREAK.split(normalized):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        units.extend([paragraph] if len(paragraph) <= body_limit else _split_long(paragraph, body_limit))

    bodies: list[str] = []
    current = ""
    for unit in units:
        if current and len(current) + 2 + len(unit) > body_limit:
            bodies.append(current)
            current = unit
        else:
            current = f"{current}\n\n{unit}" if current else unit
    if current:
        bodies.append(current)

    chunks = [bodies[0]]
    for previous, body in zip(bodies, bodies[1:]):
        tail = previous[-overlap_chars:]
        # Start the overlap at a word boundary so it reads cleanly.
        space = tail.find(" ")
        tail = tail[space + 1:] if 0 <= space < len(tail) - 1 else tail
        chunks.append(f"{tail}\n\n{body}")
    return chunks
