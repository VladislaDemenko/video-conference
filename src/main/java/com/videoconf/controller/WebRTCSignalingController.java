package com.videoconf.controller;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import java.util.Map;

@Controller
public class WebRTCSignalingController {

    private final SimpMessagingTemplate messagingTemplate;

    public WebRTCSignalingController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/webrtc.offer")
    public void handleOffer(Map<String, Object> message) {
        String targetUser = (String) message.get("targetUserId");
        messagingTemplate.convertAndSendToUser(targetUser, "/queue/webrtc", message);
    }

    @MessageMapping("/webrtc.answer")
    public void handleAnswer(Map<String, Object> message) {
        String targetUser = (String) message.get("targetUserId");
        messagingTemplate.convertAndSendToUser(targetUser, "/queue/webrtc", message);
    }

    @MessageMapping("/webrtc.ice-candidate")
    public void handleIceCandidate(Map<String, Object> message) {
        String targetUser = (String) message.get("targetUserId");
        messagingTemplate.convertAndSendToUser(targetUser, "/queue/webrtc", message);
    }

    // ОБРАБОТКА СООБЩЕНИЙ ЧАТА
    @MessageMapping("/room/{roomId}/chat")
    public void handleChatMessage(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        // Отправляем сообщение всем подписчикам комнаты
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/chat", message);
    }

    // ОБРАБОТКА ПРИСОЕДИНЕНИЯ К КОМНАТЕ
    @MessageMapping("/room/{roomId}/join")
    public void handleUserJoin(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        // Отправляем информацию о новом участнике всем в комнате
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants", message);
    }

    // ОБРАБОТКА ВЫХОДА ИЗ КОМНАТЫ
    @MessageMapping("/room/{roomId}/leave")
    public void handleUserLeave(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        // Отправляем информацию о выходе участника всем в комнате
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants", message);
    }
}