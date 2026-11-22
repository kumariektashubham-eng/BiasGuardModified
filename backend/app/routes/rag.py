from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.database import get_reference_embeddings_collection, serialize_doc
from app.services.auth_service import get_current_user
from app.services.rag_service import retrieve_relevant_references, seed_default_rag_references

router = APIRouter(prefix="/rag", tags=["RAG Vector Search"])

class RAGQueryRequest(BaseModel):
    query_text: str
    domain: Optional[str] = None
    top_k: int = 3

@router.get("/references")
async def list_references(
    domain: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    col = get_reference_embeddings_collection()
    if col.count_documents({}) == 0:
        seed_default_rag_references()
    q = {"domain": domain} if domain and domain != "ALL" else {}
    cursor = col.find(q, {"embedding": 0}).sort("created_at", -1)
    return [serialize_doc(r) for r in cursor]

@router.post("/query")
async def query_references(
    query_in: RAGQueryRequest,
    current_user: dict = Depends(get_current_user)
):
    results = retrieve_relevant_references(
        candidate_answer=query_in.query_text,
        domain=query_in.domain,
        top_k=query_in.top_k
    )
    # Strip heavy embedding array from response for quick transmission
    for r in results:
        r.pop("embedding", None)
    return results

@router.post("/seed")
async def reseed_references(current_user: dict = Depends(get_current_user)):
    col = get_reference_embeddings_collection()
    col.delete_many({})
    seed_default_rag_references()
    return {"message": "RAG references successfully re-indexed in MongoDB vector store."}
