import re
import chromadb
from pathlib import Path
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

DOCUMENTS_DIR = Path(__file__).parent / "documents"
CHROMA_DIR = Path(__file__).parent / "chroma_data"
COLLECTION_NAME = "novatech_docs"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

SOURCE_PREFIXES = {
    "POL-": 1,
    "PROC-": 1,
    "SLA-": 2,
    "FAQ-": 3,
}


def get_source_priority(filename: str) -> int:
    for prefix, priority in SOURCE_PREFIXES.items():
        if filename.startswith(prefix):
            return priority
    return 3


def get_document_id(filename: str) -> str:
    stem = Path(filename).stem
    m = re.match(r"^([A-Z]+-\d{3,4})(?:-v(\d+))?", stem)
    if m:
        base = m.group(1)
        version = m.group(2)
        if version:
            return f"{base}-v{version}"
        vm = re.search(r"-v(\d+)", stem)
        if vm:
            return f"{base}-v{vm.group(1)}"
        return base
    return stem


def ingest():
    print(f"Carregando modelo de embeddings: {EMBEDDING_MODEL}")
    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL, model_kwargs={"device": "cpu"})

    headers_to_split_on = [
        ("#", "H1"),
        ("##", "H2"),
        ("###", "H3"),
    ]
    md_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=headers_to_split_on,
        strip_headers=False,
    )
    char_splitter = RecursiveCharacterTextSplitter(chunk_size=600, chunk_overlap=50)

    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    try:
        client.delete_collection(COLLECTION_NAME)
        print(f"Coleção '{COLLECTION_NAME}' existente removida.\n")
    except Exception:
        pass

    texts = []
    metadatas = []

    for md_file in sorted(DOCUMENTS_DIR.glob("*.md")):
        content = md_file.read_text(encoding="utf-8")
        filename = md_file.name
        doc_id = get_document_id(filename)
        priority = get_source_priority(filename)

        splits = md_splitter.split_text(content)
        file_chunks = []

        for split in splits:
            headers = split.metadata
            section_parts = []
            for key in ["H2", "H3"]:
                if headers.get(key):
                    section_parts.append(headers[key])
            section_path = " > ".join(section_parts) if section_parts else doc_id

            chunk_text = split.page_content.strip()
            if not chunk_text:
                continue

            chunk_meta = {
                "source_file": filename,
                "document_id": doc_id,
                "source_priority": priority,
                "section_path": section_path,
            }

            if len(chunk_text) > 600:
                for sub in char_splitter.split_text(chunk_text):
                    if sub.strip():
                        file_chunks.append((sub.strip(), chunk_meta))
            else:
                file_chunks.append((chunk_text, chunk_meta))

        for chunk_text, chunk_meta in file_chunks:
            texts.append(chunk_text)
            metadatas.append(chunk_meta)

        print(f"  {filename}: {len(file_chunks)} chunks")

    vectorstore = Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=embeddings,
        persist_directory=str(CHROMA_DIR),
    )
    vectorstore.add_texts(texts=texts, metadatas=metadatas)

    print(f"\nTotal: {len(texts)} chunks armazenados em {CHROMA_DIR}")
