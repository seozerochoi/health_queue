from django.shortcuts import render
from .tasks import auto_end_usage
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from gyms.models import Equipment
from .models import UsageLog, WaitlistEntry
from django.utils import timezone
import datetime

# --- 이전에 작성한 클래스 ---
class EquipmentInteractionAPIView(APIView):
    permission_classes = [IsAuthenticated]

    # 사용 종료 및 다음 사용자에게 알림을 보내는 함수 (나중에 Channels로 확장)
    def end_usage_and_notify_next(self, equipment, usage_log):
        # 1. 사용 기록에 종료 시간 기록
        usage_log.delete()

        # 2. 기구 상태를 '사용 가능'으로 변경
        equipment.status = Equipment.Status.AVAILABLE
        equipment.save()

        # 3. 대기열 확인 및 다음 사용자 처리
        next_in_line = WaitlistEntry.objects.filter(equipment=equipment).first()
        if next_in_line:
            # TODO: 다음 사용자에게 푸시 알림 보내는 로직 (예: "이제 OOO 기구를 사용할 수 있습니다!")
            # TODO: 5분 내 태깅하지 않으면 취소되는 타이머 로직 시작
            print(f"알림: {next_in_line.user.email}님, {equipment.name} 사용 가능")
            # 여기서는 일단 다음 사용자가 바로 사용하는 것으로 가정하고 로직을 단순화합니다.
            
            # 다음 사용자를 위해 기구를 다시 '사용 중'으로 변경하고 UsageLog 생성
            equipment.status = Equipment.Status.IN_USE
            equipment.save()
            end_time = timezone.now() + datetime.timedelta(minutes=equipment.base_usage_time)
            usage_log=UsageLog.objects.create(user=next_in_line.user, equipment=equipment, expected_end_time=end_time)
            auto_end_usage.apply_async(args=[usage_log.id], eta=end_time)
            next_in_line.delete() # 대기열에서 제거
            
            # TODO: 아두이노에 '잠금 해제' 신호 전송
        else:
            # TODO: 아두이노에 '잠금' 신호 전송
            equipment.status = Equipment.Status.LOCKED # 기획서에 따라 아무도 없으면 잠금 상태로 변경
            equipment.save()

    def post(self, request, equipment_id):
        user = request.user
        try:
            target_equipment = Equipment.objects.get(id=equipment_id)
        except Equipment.DoesNotExist:
            return Response({"error": "기구가 존재하지 않습니다."}, status=status.HTTP_404_NOT_FOUND)

        # 현재 내가 사용 중인 기구가 있는지 확인
        my_current_usage = UsageLog.objects.filter(user=user).first()

        # --- 시나리오 분기 ---
        # A. 내가 현재 무언가 사용 중일 때
        if my_current_usage:
            # A-1. 사용하던 바로 그 기구를 다시 태그한 경우 -> 사용 종료
            if my_current_usage.equipment == target_equipment:
                self.end_usage_and_notify_next(target_equipment, my_current_usage)
                return Response({"message": f"{target_equipment.name} 사용을 종료합니다."}, status=status.HTTP_200_OK)
            
            # A-2. 사용하던 기구가 있는데 다른 기구를 태그한 경우 -> 기존 것 종료 후 새 것 시작
            else:
                # 기존 기구 사용 종료 처리
                self.end_usage_and_notify_next(my_current_usage.equipment, my_current_usage)
                
                # 이제 새로 태그한 기구가 비어있다면 즉시 사용 시작
                if target_equipment.status == Equipment.Status.AVAILABLE or target_equipment.status == Equipment.Status.LOCKED:
                    target_equipment.status = Equipment.Status.IN_USE
                    target_equipment.save()
                    end_time = timezone.now() + datetime.timedelta(minutes=target_equipment.base_usage_time)
                    usage_log=UsageLog.objects.create(user=user, equipment=target_equipment, expected_end_time=end_time)
                    auto_end_usage.apply_async(args=[usage_log.id], eta=end_time)
                    # TODO: 아두이노에 '잠금 해제' 신호 전송
                    return Response({"message": f"'{my_current_usage.equipment.name}' 사용을 종료하고 '{target_equipment.name}' 사용을 시작합니다."}, status=status.HTTP_200_OK)
                else:
                    # 새로 태그한 기구가 사용 중이면 대기열 등록 시도
                    # (이 부분은 이전 단계의 대기열 등록 로직과 동일)
                    if user.waitlist_entries.count() >= 3:
                         return Response({"error": "대기는 최대 3개까지만 가능합니다."}, status=status.HTTP_400_BAD_REQUEST)
                    WaitlistEntry.objects.create(user=user, equipment=target_equipment)
                    return Response({"message": f"'{my_current_usage.equipment.name}' 사용을 종료하고 '{target_equipment.name}' 대기열에 등록합니다."}, status=status.HTTP_200_OK)

        # B. 내가 아무것도 사용하고 있지 않을 때 (이전 단계 로직과 동일)
        else:
            if target_equipment.status == Equipment.Status.AVAILABLE or target_equipment.status == Equipment.Status.LOCKED:
                target_equipment.status = Equipment.Status.IN_USE
                target_equipment.save()
                end_time = timezone.now() + datetime.timedelta(minutes=target_equipment.base_usage_time)
                usage_log=UsageLog.objects.create(user=user, equipment=target_equipment, expected_end_time=end_time)
                auto_end_usage.apply_async(args=[usage_log.id], eta=end_time)
                # TODO: 아두이노에 '잠금 해제' 신호 전송
                return Response({"message": f"{target_equipment.name} 사용을 시작합니다."}, status=status.HTTP_200_OK)

            elif target_equipment.status == Equipment.Status.IN_USE:
                if user.waitlist_entries.count() >= 3:
                    return Response({"error": "대기는 최대 3개까지만 가능합니다."}, status=status.HTTP_400_BAD_REQUEST)
                if WaitlistEntry.objects.filter(user=user, equipment=target_equipment).exists():
                    return Response({"error": "이미 대기 중인 기구입니다."}, status=status.HTTP_400_BAD_REQUEST)
                WaitlistEntry.objects.create(user=user, equipment=target_equipment)
                return Response({"message": f"{target_equipment.name} 대기열에 등록되었습니다."}, status=status.HTTP_200_OK)

            else:
                return Response({"error": f"현재 {target_equipment.name}은(는) 사용할 수 없습니다. ({target_equipment.get_status_display()})"}, status=status.HTTP_400_BAD_REQUEST)
            
class ExtendUsageTimeAPIView(APIView):
    """
    사용자가 시간 연장을 요청했을 때 호출되는 API입니다.
    """
    permission_classes = [IsAuthenticated] # 로그인한 사용자만 호출 가능

    def post(self, request):
        user = request.user
        try:
            # 현재 로그인한 사용자의 사용 기록을 찾습니다.
            usage_log = UsageLog.objects.get(user=user)
        except UsageLog.DoesNotExist:
            return Response({"error": "현재 사용 중인 기구가 없습니다."}, status=status.HTTP_404_NOT_FOUND)

        # [cite_start]1. AI에게 추천 연장 시간을 물어봅니다. [cite: 98]
        # base_time = usage_log.equipment.base_usage_time
        # ai_time = predict_ideal_exercise_time(user, usage_log.equipment.category)
        # extension_minutes = ai_time - base_time
        extension_minutes = 7 # 지금은 테스트를 위해 7분으로 고정

        if extension_minutes <= 0:
            return Response({"message": "연장할 추가 시간이 없습니다."}, status=status.HTTP_200_OK)

        # 2. 새로운 예상 종료 시간을 계산합니다.
        new_end_time = timezone.now() + datetime.timedelta(minutes=extension_minutes)
        usage_log.expected_end_time = new_end_time
        usage_log.save()

        # 3. 새로운 종료 시간에 맞춰 '자동 종료' 알람을 다시 맞춥니다.
        auto_end_usage.apply_async(args=[usage_log.id], eta=new_end_time)

        print(f"{user.email}님이 {usage_log.equipment.name} 사용을 {extension_minutes}분 연장했습니다.")
        
        return Response({
            "message": f"{extension_minutes}분 연장되었습니다.",
            "new_end_time": new_end_time
        }, status=status.HTTP_200_OK)