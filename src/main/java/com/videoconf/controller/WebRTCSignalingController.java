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
        try {
            String targetUser = (String) message.get("targetUserId");
            String fromUser = (String) message.get("userId");
            String roomId = (String) message.get("roomId");

            System.out.println("📨 WebRTC OFFER from: " + fromUser + " to: " + targetUser + " in room: " + roomId);

            if (targetUser != null && fromUser != null && roomId != null) {
                // Проверяем существует ли целевой пользователь в комнате
                boolean targetExists = sessionService.getUserSession(roomId, targetUser).isPresent();

                if (targetExists) {
                    message.put("fromUserId", fromUser);
                    message.put("type", "offer");

                    // Отправляем через пользовательскую очередь
                    messagingTemplate.convertAndSendToUser(targetUser, "/queue/webrtc", message);
                    System.out.println("✅ OFFER forwarded to user: " + targetUser);

                    // Также отправляем в комнату для отладки
                    messagingTemplate.convertAndSend("/topic/room/" + roomId + "/webrtc-debug",
                            Map.of("type", "OFFER_SENT", "from", fromUser, "to", targetUser));
                } else {
                    System.out.println("❌ Target user not found in room: " + targetUser);

                    // Уведомляем отправителя об ошибке
                    Map<String, Object> errorMsg = new HashMap<>();
                    errorMsg.put("type", "ERROR");
                    errorMsg.put("error", "USER_NOT_FOUND");
                    errorMsg.put("targetUserId", targetUser);
                    messagingTemplate.convertAndSendToUser(fromUser, "/queue/webrtc", errorMsg);
                }
            } else {
                System.out.println("❌ Missing required fields in OFFER");
            }
        } catch (Exception e) {
            System.err.println("❌ Error handling OFFER: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @MessageMapping("/webrtc.answer")
    public void handleAnswer(Map<String, Object> message) {
        try {
            String targetUser = (String) message.get("targetUserId");
            String fromUser = (String) message.get("userId");
            String roomId = (String) message.get("roomId");

            System.out.println("📨 WebRTC ANSWER from: " + fromUser + " to: " + targetUser + " in room: " + roomId);

            if (targetUser != null && fromUser != null && roomId != null) {
                message.put("fromUserId", fromUser);
                message.put("type", "answer");

                messagingTemplate.convertAndSendToUser(targetUser, "/queue/webrtc", message);
                System.out.println("✅ ANSWER forwarded to user: " + targetUser);
            } else {
                System.out.println("❌ Missing required fields in ANSWER");
            }
        } catch (Exception e) {
            System.err.println("❌ Error handling ANSWER: " + e.getMessage());
            e.printStackTrace();
        }
    }

    @MessageMapping("/webrtc.ice-candidate")
    public void handleIceCandidate(Map<String, Object> message) {
        try {
            String targetUser = (String) message.get("targetUserId");
            String fromUser = (String) message.get("userId");
            String roomId = (String) message.get("roomId");

            System.out.println("📨 WebRTC ICE candidate from: " + fromUser + " to: " + targetUser);

            if (targetUser != null && fromUser != null && roomId != null) {
                message.put("fromUserId", fromUser);
                message.put("type", "ice-candidate");

                messagingTemplate.convertAndSendToUser(targetUser, "/queue/webrtc", message);
                System.out.println("✅ ICE candidate forwarded to: " + targetUser);
            } else {
                System.out.println("❌ Missing required fields in ICE candidate");
            }
        } catch (Exception e) {
            System.err.println("❌ Error handling ICE candidate: " + e.getMessage());
            e.printStackTrace();
        }
    }

    // ОБНОВЛЕННАЯ ОБРАБОТКА ПРИСОЕДИНЕНИЯ К КОМНАТЕ
    @MessageMapping("/room.join")
    public void handleUserJoin(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        String userId = (String) message.get("userId");
        String username = (String) message.get("username");

        System.out.println("🚪 User joining - Room: " + roomId + ", User: " + userId + ", Name: " + username);

        if (roomId != null && userId != null && username != null) {
            // Добавляем пользователя в сессию
            sessionService.addUserToRoom(roomId, userId, username);
            System.out.println("✅ User added to room session");

            // Получаем обновленный список всех участников
            List<WebRTCSessionService.UserSession> allParticipants = sessionService.getRoomUsers(roomId);
            System.out.println("👥 All participants in room: " + allParticipants.size());

            // Создаем уведомление о присоединении
            Map<String, Object> joinMessage = new HashMap<>();
            joinMessage.put("type", "USER_JOINED");
            joinMessage.put("userId", userId);
            joinMessage.put("username", username);
            joinMessage.put("timestamp", LocalDateTime.now().toString());
            joinMessage.put("participantCount", sessionService.getRoomUserCount(roomId));
            joinMessage.put("participants", allParticipants);

            // Отправляем ВСЕМ участникам комнаты (включая присоединившегося)
            messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants", joinMessage);
            System.out.println("✅ Join notification sent to ALL participants");

            // Системное сообщение в чат
            Map<String, Object> systemMessage = new HashMap<>();
            systemMessage.put("type", "SYSTEM");
            systemMessage.put("userId", "system");
            systemMessage.put("username", "Система");
            systemMessage.put("content", username + " присоединился к конференции");
            systemMessage.put("timestamp", LocalDateTime.now().toString());
            systemMessage.put("roomId", roomId);
            systemMessage.put("participantCount", sessionService.getRoomUserCount(roomId));

            messagingTemplate.convertAndSend("/topic/room/" + roomId + "/chat", systemMessage);
            System.out.println("✅ System chat message sent");

            // Отправляем текущему статус комнаты
            this.sendRoomStatusToUser(roomId, userId);

            // Уведомляем существующих участников о новом пользователе
            this.notifyExistingUsersAboutNewUser(roomId, userId, username, allParticipants);
        } else {
            System.out.println("❌ Invalid join message - missing required fields");
        }
    }

    private void sendRoomStatusToUser(String roomId, String userId) {
        Map<String, Object> roomStatus = new HashMap<>();
        roomStatus.put("type", "ROOM_STATUS");
        roomStatus.put("participantCount", sessionService.getRoomUserCount(roomId));
        roomStatus.put("participants", sessionService.getRoomUsers(roomId));
        roomStatus.put("timestamp", LocalDateTime.now().toString());

        messagingTemplate.convertAndSendToUser(userId, "/queue/room-status", roomStatus);
        System.out.println("✅ Room status sent to user: " + userId);
    }

    private void notifyExistingUsersAboutNewUser(String roomId, String newUserId, String newUsername,
                                                 List<WebRTCSessionService.UserSession> allParticipants) {
        // Фильтруем участников кроме нового
        List<WebRTCSessionService.UserSession> existingParticipants = allParticipants.stream()
                .filter(participant -> !participant.userId.equals(newUserId))
                .collect(Collectors.toList());

        if (!existingParticipants.isEmpty()) {
            Map<String, Object> newUserNotification = new HashMap<>();
            newUserNotification.put("type", "NEW_USER_JOINED");
            newUserNotification.put("userId", newUserId);
            newUserNotification.put("username", newUsername);
            newUserNotification.put("timestamp", LocalDateTime.now().toString());

            System.out.println("🔄 Notifying " + existingParticipants.size() + " existing participants about new user");

            for (WebRTCSessionService.UserSession participant : existingParticipants) {
                messagingTemplate.convertAndSendToUser(participant.userId, "/queue/webrtc", newUserNotification);
                System.out.println("✅ New user notification sent to: " + participant.userId);

                // Также отправляем команду для установки соединения
                Map<String, Object> connectCommand = new HashMap<>();
                connectCommand.put("type", "CONNECT_TO_USER");
                connectCommand.put("targetUserId", newUserId);
                connectCommand.put("username", newUsername);
                messagingTemplate.convertAndSendToUser(participant.userId, "/queue/webrtc", connectCommand);
            }
        } else {
            System.out.println("ℹ️ No existing participants to notify about new user");
        }
    }

    // Другие методы остаются без изменений...
    @MessageMapping("/room.leave")
    public void handleUserLeave(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        String userId = (String) message.get("userId");
        String username = (String) message.get("username");

        System.out.println("🚪 User leaving - Room: " + roomId + ", User: " + userId);

        if (roomId != null && userId != null) {
            sessionService.removeUserFromRoom(roomId, userId);
            System.out.println("✅ User removed from room session");

            List<WebRTCSessionService.UserSession> remainingParticipants = sessionService.getRoomUsers(roomId);

            Map<String, Object> leaveMessage = new HashMap<>();
            leaveMessage.put("type", "USER_LEFT");
            leaveMessage.put("userId", userId);
            leaveMessage.put("username", username);
            leaveMessage.put("timestamp", LocalDateTime.now().toString());
            leaveMessage.put("participantCount", sessionService.getRoomUserCount(roomId));
            leaveMessage.put("participants", remainingParticipants);

            messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants", leaveMessage);
            System.out.println("✅ Leave notification sent to remaining participants");

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
                System.out.println("✅ System leave message sent to chat");
            }
        }
    }

    @MessageMapping("/chat.send")
    public void handleChatMessage(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        if (roomId != null) {
            if (!message.containsKey("timestamp")) {
                message.put("timestamp", LocalDateTime.now().toString());
            }

            message.put("participantCount", sessionService.getRoomUserCount(roomId));
            messagingTemplate.convertAndSend("/topic/room/" + roomId + "/chat", message);

            System.out.println("💬 Chat message sent to room " + roomId + ": " + message.get("content"));
        }
    }
}