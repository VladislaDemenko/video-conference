package com.videoconf.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api/chat")
public class ChatController {

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    private final Map<String, List<Map<String, Object>>> roomMessages = new HashMap<>();

    @GetMapping("/{roomId}/history")
    public ResponseEntity<?> getChatHistory(@PathVariable String roomId) {
        List<Map<String, Object>> messages = roomMessages.getOrDefault(roomId, new ArrayList<>());
        return ResponseEntity.ok(messages);
    }

    @DeleteMapping("/{roomId}/clear")
    public ResponseEntity<?> clearChatHistory(@PathVariable String roomId) {
        roomMessages.remove(roomId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{roomId}/system")
    public ResponseEntity<?> sendSystemMessage(@PathVariable String roomId, @RequestBody Map<String, String> request) {
        String content = request.get("content");

        Map<String, Object> systemMessage = new HashMap<>();
        systemMessage.put("userId", "system");
        systemMessage.put("username", "Система");
        systemMessage.put("content", content);
        systemMessage.put("timestamp", LocalDateTime.now().toString());
        systemMessage.put("type", "SYSTEM");
        systemMessage.put("roomId", roomId);

        roomMessages.computeIfAbsent(roomId, k -> new ArrayList<>()).add(systemMessage);
        messagingTemplate.convertAndSend("/topic/room/" + roomId + "/chat", systemMessage);

        return ResponseEntity.ok(systemMessage);
    }
}