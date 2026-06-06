from pathlib import Path

SYSTEM_PROMPT_PATH = Path(__file__).parent.parent / "exercicio-1-2" / "v2-system-prompt.md"
CHUNK_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def build_prompt(
    question: str,
    chunks: list[dict],
    system_prompt_path: Path = SYSTEM_PROMPT_PATH,
) -> str:
    system_prompt = Path(system_prompt_path).read_text(encoding="utf-8")

    context_parts = []
    for i, chunk in enumerate(chunks):
        label = CHUNK_LABELS[i] if i < len(CHUNK_LABELS) else str(i + 1)
        source_ref = f"{chunk['document_id']}, {chunk['section_path']}"
        context_parts.append(f'Chunk {label}: "{chunk["text"]} — Fonte: {source_ref}"')

    context_block = "\n\n".join(context_parts)

    return f"""{system_prompt}

<context>
{context_block}
</context>

<user_question>
{question}
</user_question>"""
