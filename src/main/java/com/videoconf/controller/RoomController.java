package com.videoconf.controller;

import com.videoconf.model.Room;
import com.videoconf.service.RoomService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Controller
public class RoomController {

    @Autowired
    private RoomService roomService;

    @GetMapping("/")
    public String index() {
        return "index";
    }

    @GetMapping("/room/{roomId}")
    public String room(@PathVariable String roomId) {
        return "room";
    }

    @PostMapping("/api/rooms/create")
    @ResponseBody
    public ResponseEntity<?> createRoom(@RequestBody Map<String, String> request) {
        try {
            String roomName = request.get("name");
            String ownerId = UUID.randomUUID().toString();

            Room room = roomService.createRoom(roomName, ownerId, 10);

            Map<String, Object> response = new HashMap<>();
            response.put("roomId", room.getId());
            response.put("roomName", room.getName());
            response.put("inviteLink", "http://localhost:8081/room/" + room.getId());
            response.put("inviteCode", room.getInviteCode()); // Возвращаем код приглашения

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "Error creating room: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @GetMapping("/api/rooms/{roomId}/exists")
    @ResponseBody
    public ResponseEntity<?> checkRoomExists(@PathVariable String roomId) {
        boolean exists = roomService.roomExists(roomId);
        Map<String, Boolean> response = new HashMap<>();
        response.put("exists", exists);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/api/rooms/invite/{inviteCode}/exists")
    @ResponseBody
    public ResponseEntity<?> checkInviteCodeExists(@PathVariable String inviteCode) {
        boolean exists = roomService.inviteCodeExists(inviteCode);
        Map<String, Boolean> response = new HashMap<>();
        response.put("exists", exists);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/api/rooms/invite/{inviteCode}")
    @ResponseBody
    public ResponseEntity<?> getRoomByInviteCode(@PathVariable String inviteCode) {
        return roomService.getRoomByInviteCode(inviteCode)
                .map(room -> {
                    Map<String, Object> response = new HashMap<>();
                    response.put("roomId", room.getId());
                    response.put("roomName", room.getName());
                    response.put("inviteCode", room.getInviteCode());
                    return ResponseEntity.ok(response);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/api/rooms/{roomId}")
    @ResponseBody
    public ResponseEntity<?> getRoomInfo(@PathVariable String roomId) {
        return roomService.getRoom(roomId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}