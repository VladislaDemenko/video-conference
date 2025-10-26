package com.videoconf.service;

import org.springframework.stereotype.Service;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.time.LocalDateTime;

@Service
public class WebRTCSessionService {
    private final Map<String, Map<String, UserSession>> roomSessions = new ConcurrentHashMap<>();

    public static class UserSession {
        public String userId;
        public String username;
        public String status;
        public LocalDateTime joinedAt;

        public UserSession(String userId, String username) {
            this.userId = userId;
            this.username = username;
            this.status = "connected";
            this.joinedAt = LocalDateTime.now();
        }
    }

    public void addUserToRoom(String roomId, String userId, String username) {
        roomSessions.computeIfAbsent(roomId, k -> new ConcurrentHashMap<>())
                .put(userId, new UserSession(userId, username));
    }

    public void removeUserFromRoom(String roomId, String userId) {
        Map<String, UserSession> room = roomSessions.get(roomId);
        if (room != null) {
            room.remove(userId);
            if (room.isEmpty()) {
                roomSessions.remove(roomId);
            }
        }
    }

    public List<UserSession> getRoomUsers(String roomId) {
        Map<String, UserSession> room = roomSessions.get(roomId);
        return room != null ? new ArrayList<>(room.values()) : Collections.emptyList();
    }

    public int getRoomUserCount(String roomId) {
        Map<String, UserSession> room = roomSessions.get(roomId);
        return room != null ? room.size() : 0;
    }

    public void updateUserStatus(String roomId, String userId, String status) {
        Map<String, UserSession> room = roomSessions.get(roomId);
        if (room != null && room.containsKey(userId)) {
            room.get(userId).status = status;
        }
    }

    public Optional<UserSession> getUserSession(String roomId, String userId) {
        Map<String, UserSession> room = roomSessions.get(roomId);
        return room != null ? Optional.ofNullable(room.get(userId)) : Optional.empty();
    }
}