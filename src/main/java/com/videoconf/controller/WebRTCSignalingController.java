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
        String targetUser = (String) message.get("targetUser");
        messagingTemplate.convertAndSendToUser(targetUser, "/queue/webrtc", message);
    }

    @MessageMapping("/webrtc.answer")
    public void handleAnswer(Map<String, Object> message) {
        String targetUser = (String) message.get("targetUser");
        messagingTemplate.convertAndSendToUser(targetUser, "/queue/webrtc", message);
    }

    @MessageMapping("/webrtc.ice-candidate")
    public void handleIceCandidate(Map<String, Object> message) {
        String targetUser = (String) message.get("targetUser");
        messagingTemplate.convertAndSendToUser(targetUser, "/queue/webrtc", message);
    }

    @MessageMapping("/room/{roomId}/chat")
    public void handleChatMessage(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/chat", message);
    }

    @MessageMapping("/room/{roomId}/join")
    public void handleUserJoin(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants", message);
    }

    @MessageMapping("/room/{roomId}/leave")
    public void handleUserLeave(Map<String, Object> message) {
        String roomId = (String) message.get("roomId");
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/participants", message);
    }

    @MessageMapping("/webrtc.signal")
    public void handleSignal(Map<String, Object> signal) {
        String targetUserId = (String) signal.get("targetUserId");
        String roomId = (String) signal.get("roomId");

        // Отправляем сигнал конкретному пользователю
        messagingTemplate.convertAndSendToUser(targetUserId, "/queue/webrtc", signal);
    }
}