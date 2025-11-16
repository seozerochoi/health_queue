from celery import shared_task
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
from .models import Reservation


@shared_task(bind=True)
def expire_notified_reservations(self, timeout_minutes: float = 0.25, batch_size: int = 50):
    """
    Expire NOTIFIED reservations older than timeout_minutes and notify next waiting users.
    This task is intended to be run periodically (or scheduled per-reservation).
    """
    cutoff = timezone.now() - timedelta(minutes=timeout_minutes)
    expired_total = 0
    notified_total = 0

    # Batch processing with select_for_update(skip_locked=True) for safety
    while True:
        with transaction.atomic():
            qs = (
                Reservation.objects.select_for_update(skip_locked=True)
                .filter(status='NOTIFIED', notified_at__lt=cutoff)
                .order_by('notified_at')[:batch_size]
            )

            reservations = list(qs)
            if not reservations:
                break

            for r in reservations:
                r.status = 'EXPIRED'
                r.save()
                expired_total += 1

                # notify next waiting
                next_r = (
                    Reservation.objects.filter(equipment=r.equipment, status='WAITING')
                    .order_by('created_at')
                    .first()
                )
                if next_r:
                    next_r.status = 'NOTIFIED'
                    next_r.notified_at = timezone.now()
                    next_r.save()
                    notified_total += 1
                    # TODO: enqueue/send FCM push notification for next_r.user

    return {'expired': expired_total, 'notified': notified_total}
