from pathlib import Path
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

CHROMA_DIR = Path(__file__).parent / "chroma_data"
COLLECTION_NAME = "novatech_docs"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

_vectorstore = None


def _get_vectorstore() -> Chroma:
    global _vectorstore
    if _vectorstore is None:
        embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL, model_kwargs={"device": "cpu"})
        _vectorstore = Chroma(
            collection_name=COLLECTION_NAME,
            embedding_function=embeddings,
            persist_directory=str(CHROMA_DIR),
        )
    return _vectorstore


def search(question: str, n_results: int = 5) -> list[dict]:
    vs = _get_vectorstore()
    results = vs.similarity_search_with_score(question, k=n_results)

    chunks = []
    for doc, score in results:
        chunks.append({
            "text": doc.page_content,
            "source_file": doc.metadata.get("source_file", ""),
            "document_id": doc.metadata.get("document_id", ""),
            "source_priority": doc.metadata.get("source_priority", 3),
            "section_path": doc.metadata.get("section_path", ""),
            "score": float(score),
        })

    return chunks
