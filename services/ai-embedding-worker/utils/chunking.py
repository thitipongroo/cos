from dataclasses import dataclass


@dataclass
class Chunk:
    content: str
    chunk_index: int
    source_type: str
    source_id: str


def chunk_document(
    text: str,
    source_type: str,
    source_id: str,
    chunk_size: int = 500,
    chunk_overlap: int = 100,
) -> list[Chunk]:
    """Recursive character splitter for documents.

    Site reports are treated as single chunks (typically < 500 tokens).
    Source: context/00_master_construction_os.md §Phase 11 + ai/chains/rag.yaml
    """
    if source_type == "site_report":
        return [Chunk(content=text, chunk_index=0, source_type=source_type, source_id=source_id)]

    chunks = _recursive_split(text, chunk_size, chunk_overlap)
    return [
        Chunk(content=chunk, chunk_index=i, source_type=source_type, source_id=source_id)
        for i, chunk in enumerate(chunks)
    ]


def _recursive_split(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    separators = ["\n\n", "\n", ". ", " ", ""]
    return _split_with_separators(text, chunk_size, chunk_overlap, separators)


def _split_with_separators(
    text: str, chunk_size: int, chunk_overlap: int, separators: list[str]
) -> list[str]:
    if not separators:
        return _split_by_size(text, chunk_size, chunk_overlap)

    separator = separators[0]
    remaining = separators[1:]

    if separator == "":
        return _split_by_size(text, chunk_size, chunk_overlap)

    parts = text.split(separator)
    chunks: list[str] = []
    current = ""

    for part in parts:
        candidate = (current + separator + part).lstrip(separator) if current else part
        if len(candidate) <= chunk_size:
            current = candidate
        else:
            if current:
                chunks.append(current)
            if len(part) > chunk_size:
                sub = _split_with_separators(part, chunk_size, chunk_overlap, remaining)
                chunks.extend(sub)
                current = sub[-1][-chunk_overlap:] if sub and chunk_overlap else ""
            else:
                current = part

    if current:
        chunks.append(current)

    return _merge_with_overlap(chunks, chunk_size, chunk_overlap)


def _split_by_size(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start = end - chunk_overlap
        if start >= len(text):
            break
    return chunks


def _merge_with_overlap(chunks: list[str], chunk_size: int, chunk_overlap: int) -> list[str]:
    if not chunks:
        return chunks
    merged: list[str] = []
    current = chunks[0]
    for next_chunk in chunks[1:]:
        candidate = current + " " + next_chunk
        if len(candidate) <= chunk_size:
            current = candidate
        else:
            merged.append(current)
            overlap = current[-chunk_overlap:] if chunk_overlap and len(current) > chunk_overlap else ""
            current = (overlap + " " + next_chunk).lstrip() if overlap else next_chunk
    merged.append(current)
    return merged
