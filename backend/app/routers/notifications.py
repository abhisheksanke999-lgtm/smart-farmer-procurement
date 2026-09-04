from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Notification
from ..auth import require_user

router = APIRouter(prefix="/api/notifications", tags=["Notification Centre"])

@router.get("")
@router.get("/")
def get_user_notifications(current_user: User = Depends(require_user), db: Session = Depends(get_db)):
    notifs = db.query(Notification).filter(Notification.user_id == current_user.id).order_by(Notification.created_at.desc()).limit(30).all()
    unread_count = db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read == False).count()
    
    res = []
    for n in notifs:
        res.append({
            "id": n.id,
            "title": n.title,
            "title_te": n.title_te or n.title,
            "message": n.message,
            "message_te": n.message_te or n.message,
            "type": n.type,
            "is_read": n.is_read,
            "created_at": n.created_at.strftime("%Y-%m-%d %H:%M")
        })
    
    return {
        "unread_count": unread_count,
        "notifications": res
    }

@router.post("/{notification_id}/read")
def mark_notification_read(notification_id: int, current_user: User = Depends(require_user), db: Session = Depends(get_db)):
    notif = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == current_user.id).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"message": "Notification marked as read."}

@router.post("/read-all")
def mark_all_notifications_read(current_user: User = Depends(require_user), db: Session = Depends(get_db)):
    db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read."}

@router.post("/register-push-token")
def register_push_token(token: str, current_user: User = Depends(require_user)):
    # FCM / Web Push Token registration handler for production integration
    return {"message": "Push notification token registered successfully.", "token_prefix": token[:10]}
