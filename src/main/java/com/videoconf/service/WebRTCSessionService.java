package com.videoconf.service;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class WebRTCSessionService {
    private final Map<String, Map<String, String>> roomSessions = new ConcurrentHashMap<>();

    public void addUserToRoom(String roomId, String userId) {
        roomSessions.computeIfAbsent(roomId, k -> new ConcurrentHashMap<>()).put(userId, "connected");
    }

    public void removeUserFromRoom(String roomId, String userId) {
        Map<String, String> room = roomSessions.get(roomId);
        if (room != null) {
            room.remove(userId);
        }
    }

    public List<String> getRoomUsers(String roomId) {
        Map<String, String> room = roomSessions.get(roomId);
        return room != null ? new ArrayList<>(room.keySet()) : Collections.emptyList();
    }
}
