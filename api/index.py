import uuid
import logging
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import desc

from . import models, schemas
from .database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Assignment Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/transaction", response_model=schemas.TransactionResponse)
def create_transaction(request: schemas.TransactionRequest, db: Session = Depends(get_db)):
    # 1. Prevent Duplicates (Idempotency Key Check)
    existing_txn = db.query(models.Transaction).filter(models.Transaction.idempotency_key == request.idempotency_key).first()
    if existing_txn:
        return schemas.TransactionResponse(
            transaction_id=existing_txn.transaction_id,
            user_id=existing_txn.user_id,
            amount=existing_txn.amount,
            status="success (duplicate request prevented)"
        )
    
    # 2. Concurrency & Consistency (Handled inside a single DB transaction)
    try:
        user = db.query(models.User).filter(models.User.user_id == request.user_id).first()
        if not user:
            user = models.User(user_id=request.user_id, total_amount=0, transaction_count=0, score=0)
            db.add(user)
            db.flush() 
        
        # Calculate new totals
        new_total_amount = user.total_amount + request.amount
        new_transaction_count = user.transaction_count + 1
        
        # 3. Fair Ranking Logic
        new_score = (new_total_amount * 0.7) + (new_transaction_count * 10)
        
        user.total_amount = new_total_amount
        user.transaction_count = new_transaction_count
        user.score = new_score

        txn_id = str(uuid.uuid4())
        new_txn = models.Transaction(
            transaction_id=txn_id,
            user_id=request.user_id,
            amount=request.amount,
            idempotency_key=request.idempotency_key
        )
        db.add(new_txn)
        
        # Atomic commit
        db.commit()
        return schemas.TransactionResponse(
            transaction_id=txn_id,
            user_id=request.user_id,
            amount=request.amount,
            status="success"
        )
    except IntegrityError:
        # Handles edge-case race conditions where duplicate keys arrive at the exact same millisecond
        db.rollback()
        existing_txn = db.query(models.Transaction).filter(models.Transaction.idempotency_key == request.idempotency_key).first()
        if existing_txn:
            return schemas.TransactionResponse(
                transaction_id=existing_txn.transaction_id,
                user_id=existing_txn.user_id,
                amount=existing_txn.amount,
                status="success (duplicate request prevented)"
            )
        raise HTTPException(status_code=500, detail="Database Error")
    except Exception as e:
        db.rollback()
        logging.error(f"Error processing transaction: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal Server Error")

@app.get("/api/summary/{user_id}", response_model=schemas.UserSummary)
def get_user_summary(user_id: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    rank = db.query(models.User).filter(models.User.score > user.score).count() + 1
    
    return schemas.UserSummary(
        user_id=user.user_id,
        total_amount=user.total_amount,
        transaction_count=user.transaction_count,
        score=user.score,
        rank=rank
    )

@app.get("/api/ranking", response_model=schemas.RankingResponse)
def get_ranking(limit: int = 10, db: Session = Depends(get_db)):
    users = db.query(models.User).order_by(desc(models.User.score)).limit(limit).all()
    
    rankings = []
    for idx, user in enumerate(users):
        rankings.append(schemas.UserSummary(
            user_id=user.user_id,
            total_amount=user.total_amount,
            transaction_count=user.transaction_count,
            score=user.score,
            rank=idx + 1
        ))
        
    return schemas.RankingResponse(rankings=rankings)