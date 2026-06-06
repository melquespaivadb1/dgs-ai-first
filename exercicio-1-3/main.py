import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# HUGGINGFACEHUB_API_TOKEN é o nome usado no .env; HF_TOKEN é o nome esperado pelo hub
if not os.environ.get("HF_TOKEN") and os.environ.get("HUGGINGFACEHUB_API_TOKEN"):
    os.environ["HF_TOKEN"] = os.environ["HUGGINGFACEHUB_API_TOKEN"]

from ingest import ingest
from retrieval import search
from prompt_builder import build_prompt


def main():
    if len(sys.argv) < 2:
        print("Uso:")
        print("  python main.py ingest")
        print('  python main.py query "sua pergunta aqui"')
        sys.exit(1)

    command = sys.argv[1]

    if command == "ingest":
        ingest()

    elif command == "query":
        if len(sys.argv) < 3:
            print('Erro: forneça uma pergunta. Ex: python main.py query "Qual o prazo de devolução?"')
            sys.exit(1)

        question = sys.argv[2]
        print(f"Buscando chunks para: {question!r}\n")

        chunks = search(question, n_results=5)

        print(f"Top {len(chunks)} chunks encontrados:")
        for i, chunk in enumerate(chunks):
            print(f"  [{i+1}] {chunk['document_id']} | Prioridade {chunk['source_priority']} | Score {chunk['score']:.4f}")
            print(f"       Seção: {chunk['section_path']}")
        print()

        prompt = build_prompt(question, chunks)

        print("=" * 60)
        print("PROMPT FINAL (copie e cole no Claude Chat):")
        print("=" * 60)
        print(prompt)

    else:
        print(f"Comando desconhecido: {command!r}")
        print("Use 'ingest' ou 'query'.")
        sys.exit(1)


if __name__ == "__main__":
    main()
