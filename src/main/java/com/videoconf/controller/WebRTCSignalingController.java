package com.videoconf.controller;

import com.videoconf.service.WebRTCSessionService;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Controller
public class WebRTCSignalingController {

    private final SimpMessagingTemplate messagingTemplate;
    private final WebRTCSessionService sessionService;

    public WebRTCSignalingController(SimpMessagingTemplate messagingTemplate,
                                     WebRTCSessionService sessionService) {
        this.messagingTemplate = messagingTemplate;
        this.sessionService = sessionService;
    }

    @MessageMapping("/webrtc.offer")
    public void handleOffer(Map<String, Object> message) {
        String targetUser = (String) message.get("targetUserId");
        if (targetUser != null) {
            messagingTemplate.convertAndSendToUser(targetUser, "/queue/webrtc", message);
        }
    }

    @MessageMapping("/webrtc.answer")
    public void handleAnswer(Map<String, Object> message) {
        String targetUser = (String) message.get("targetUserId");
        if (targetUser != null) {
            messagingTemplate.convertAndSendToUser(targetUser, "/queue/webrtc", message);
        }
    }

    @MessageMapping("/webrtc.ice-candidate")
    public void handleIceCandidate(Map<String, Object> message) {
        String targetUser = (String) message.get("targetUserId");
        if (targetUser != null) {
            messagingTemplate.convertAndSendToUser(targetUser, "/queue/webrtc", message);
        }
    }

    // ОБРАБОТКА СООБЩЕНИЙ ЧАТА
    @MessageMapping("/chat.send")
    public void handleChatMessage(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        if (roomId != null) {
            // Добавляем timestamp если его нет
            if (!message.containsKey("timestamp")) {
                message.put("timestamp", LocalDateTime.now().toString());
            }

            // Добавляем информацию об участниках
            message.put("participantCount", sessionService.getRoomUserCount(roomId));

            // Отправляем сообщение всем подписчикам комнаты
            messagingTemplate.convertAndSend("/topic/room/" + roomId + "/chat", message);

            System.out.println("Chat message sent to room " + roomId + ": " + message);
        }
    }

    // ОБРАБОТКА ПРИСОЕДИНЕНИЯ К КОМНАТЕ
    @MessageMapping("/room.join")
    public void handleUserJoin(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        String userId = (String) message.get("userId");
        String username = (String) message.get("username");

        if (roomId != null && userId != null && username != null) {
            // Добавляем пользователя в сессию
            sessionService.addUserToRoom(roomId, userId, username);

            // Получаем список участников БЕЗ текущего пользователя для отправки ему
            List<WebRTCSessionService.UserSession> otherParticipants = sessionService.getRoomUsers(roomId)
                    .stream()
                    .filter(participant -> !participant.userId.equals(userId))
                    .collect(Collectors.toList());

            // Создаем уведомление о присоединении для всех участников
            Map<String, Object> joinMessage = new HashMap<>();
            joinMessage.put("type", "USER_JOINED");
            joinMessage.put("userId", userId);
            joinMessage.put("username", username);
            joinMessage.put("timestamp", LocalDateTime.now().toString());
            joinMessage.put("participantCount", sessionService.getRoomUserCount(roomId));
            joinMessage.put("participants", otherParticipants);

            // Отправляем всем участникам комнаты (кроме присоединившегося)
            messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants", joinMessage);

            // Отправляем системное сообщение в чат
            Map<String, Object> systemMessage = new HashMap<>();
            systemMessage.put("type", "SYSTEM");
            systemMessage.put("userId", "system");
            systemMessage.put("username", "Система");
            systemMessage.put("content", username + " присоединился к конференции");
            systemMessage.put("timestamp", LocalDateTime.now().toString());
            systemMessage.put("roomId", roomId);
            systemMessage.put("participantCount", sessionService.getRoomUserCount(roomId));

            messagingTemplate.convertAndSend("/topic/room/" + roomId + "/chat", systemMessage);

            // Отправляем текущему статус комнаты с полным списком участников
            Map<String, Object> roomStatus = new HashMap<>();
            roomStatus.put("type", "ROOM_STATUS");
            roomStatus.put("participantCount", sessionService.getRoomUserCount(roomId));
            roomStatus.put("participants", sessionService.getRoomUsers(roomId));
            roomStatus.put("timestamp", LocalDateTime.now().toString());

            messagingTemplate.convertAndSendToUser(userId, "/queue/room-status", roomStatus);
        }
    }

    // ОБРАБОТКА ВЫХОДА ИЗ КОМНАТЫ
    @MessageMapping("/room.leave")
    public void handleUserLeave(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        String userId = (String) message.get("userId");
        String username = (String) message.get("username");

        if (roomId != null && userId != null) {
            // Удаляем пользователя из сессии
            sessionService.removeUserFromRoom(roomId, userId);

            // Получаем список оставшихся участников
            List<WebRTCSessionService.UserSession> remainingParticipants = sessionService.getRoomUsers(roomId);

            // Создаем уведомление о выходе
            Map<String, Object> leaveMessage = new HashMap<>();
            leaveMessage.put("type", "USER_LEFT");
            leaveMessage.put("userId", userId);
            leaveMessage.put("username", username);
            leaveMessage.put("timestamp", LocalDateTime.now().toString());
            leaveMessage.put("participantCount", sessionService.getRoomUserCount(roomId));
            leaveMessage.put("participants", remainingParticipants);

            // Отправляем всем оставшимся участникам комнаты
            messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants", leaveMessage);

            // Отправляем системное сообщение в чат
            if (username != null) {
                Map<String, Object> systemMessage = new HashMap<>();
                systemMessage.put("type", "SYSTEM");
                systemMessage.put("userId", "system");
                systemMessage.put("username", "Система");
                systemMessage.put("content", username + " покинул конференцию");
                systemMessage.put("timestamp", LocalDateTime.now().toString());
                systemMessage.put("roomId", roomId);
                systemMessage.put("participantCount", sessionService.getRoomUserCount(roomId));

                messagingTemplate.convertAndSend("/topic/room/" + roomId + "/chat", systemMessage);
            }
        }
    }

    // ЗАПРОС ТЕКУЩЕГО СОСТОЯНИЯ КОМНАТЫ
    @MessageMapping("/room.status")
    public void handleRoomStatusRequest(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        String userId = (String) message.get("userId");

        if (roomId != null) {
            Map<String, Object> statusMessage = new HashMap<>();
            statusMessage.put("type", "ROOM_STATUS");
            statusMessage.put("participantCount", sessionService.getRoomUserCount(roomId));
            statusMessage.put("participants", sessionService.getRoomUsers(roomId));
            statusMessage.put("timestamp", LocalDateTime.now().toString());

            if (userId != null) {
                // Отправляем конкретному пользователю
                messagingTemplate.convertAndSendToUser(userId, "/queue/room-status", statusMessage);
            } else {
                // Отправляем всем в комнате
                messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants", statusMessage);
            }
        }
    }
}