package com.videoconf.controller;

import com.videoconf.service.WebRTCSessionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/room")
public class RoomStatusController {

    @Autowired
    private WebRTCSessionService sessionService;

    @GetMapping("/{roomId}/participants")
    public ResponseEntity<?> getRoomParticipants(@PathVariable String roomId) {
        try {
            Map<String, Object> response = new HashMap<>();
            response.put("participantCount", sessionService.getRoomUserCount(roomId));
            response.put("participants", sessionService.getRoomUsers(roomId));
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "Failed to get room participants: " + e.getMessage())
            );
        }
    }

    @GetMapping("/{roomId}/participants/count")
    public ResponseEntity<?> getRoomParticipantCount(@PathVariable String roomId) {
        try {
            return ResponseEntity.ok(
                    Map.of("participantCount", sessionService.getRoomUserCount(roomId))
            );
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(
                    Map.of("error", "Failed to get participant count: " + e.getMessage())
            );
        }
    }
}