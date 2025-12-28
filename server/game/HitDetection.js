// Hit Detection - Server-side raycast and lag compensation
export class HitDetection {
    constructor() {
        // Hitboxes exactly matching SniperModel dimensions
        this.hitboxes = {
            HEAD: { size: { x: 0.3, y: 0.3, z: 0.3 }, offset: { x: 0, y: 1.7, z: 0 } },
            UPPER_BODY: { size: { x: 0.5, y: 0.5, z: 0.3 }, offset: { x: 0, y: 1.35, z: 0 } },
            LOWER_BODY: { size: { x: 0.45, y: 0.3, z: 0.28 }, offset: { x: 0, y: 0.95, z: 0 } },
            LEFT_ARM: { size: { x: 0.12, y: 0.6, z: 0.12 }, offset: { x: -0.35, y: 1.35, z: 0.2 } },
            RIGHT_ARM: { size: { x: 0.12, y: 0.6, z: 0.12 }, offset: { x: 0.35, y: 1.35, z: 0.1 } },
            LEFT_LEG: { size: { x: 0.18, y: 0.9, z: 0.22 }, offset: { x: -0.15, y: 0.45, z: 0 } },
            RIGHT_LEG: { size: { x: 0.18, y: 0.9, z: 0.22 }, offset: { x: 0.15, y: 0.45, z: 0 } }
        };
    }

    performRaycast(origin, direction, players, shooterId, timestamp, stateHistory) {
        const compensatedState = this.getCompensatedState(timestamp, stateHistory);
        let closestHit = null;

        for (const [playerId, player] of players) {
            if (playerId === shooterId || player.isDead) continue;

            const playerPos = compensatedState?.players[playerId]?.position || player.position;
            const playerYaw = compensatedState?.players[playerId]?.rotation?.yaw || player.rotation.yaw || 0;

            // Check each hitbox
            for (const [boxName, box] of Object.entries(this.hitboxes)) {
                // For simplicity, we use AABB after applying player position.
                // For "perfect" precision, we should ideally account for player YAW.
                // However, Box-Ray with AABB is already much more precise than spheres.
                const hit = this.checkRayBoxIntersection(origin, direction, playerPos, playerYaw, box);

                if (hit && (!closestHit || hit.distance < closestHit.distance)) {
                    closestHit = {
                        hit: true,
                        victimId: playerId,
                        hitbox: boxName,
                        impactPoint: hit.point,
                        distance: hit.distance
                    };
                }
            }
        }

        return closestHit || { hit: false };
    }

    checkRayBoxIntersection(rayOrigin, rayDir, playerPos, playerYaw, box) {
        // 1. Calculate box center in world space
        // We ignore YAW for now to keep it as AABB, which is mostly fine for sniper duels.
        // For true pixel-perfect, we'd transform the ray into the box's local space.

        const boxCenter = {
            x: playerPos.x + box.offset.x,
            y: playerPos.y + box.offset.y,
            z: playerPos.z + box.offset.z
        };

        const half = {
            x: box.size.x / 2,
            y: box.size.y / 2,
            z: box.size.z / 2
        };

        const min = { x: boxCenter.x - half.x, y: boxCenter.y - half.y, z: boxCenter.z - half.z };
        const max = { x: boxCenter.x + half.x, y: boxCenter.y + half.y, z: boxCenter.z + half.z };

        // Ray-AABB Slab Method
        let tmin = -Infinity, tmax = Infinity;

        // X Axis
        if (rayDir.x !== 0) {
            let t1 = (min.x - rayOrigin.x) / rayDir.x;
            let t2 = (max.x - rayOrigin.x) / rayDir.x;
            tmin = Math.max(tmin, Math.min(t1, t2));
            tmax = Math.min(tmax, Math.max(t1, t2));
        } else if (rayOrigin.x < min.x || rayOrigin.x > max.x) return null;

        // Y Axis
        if (rayDir.y !== 0) {
            let t1 = (min.y - rayOrigin.y) / rayDir.y;
            let t2 = (max.y - rayOrigin.y) / rayDir.y;
            tmin = Math.max(tmin, Math.min(t1, t2));
            tmax = Math.min(tmax, Math.max(t1, t2));
        } else if (rayOrigin.y < min.y || rayOrigin.y > max.y) return null;

        // Z Axis
        if (rayDir.z !== 0) {
            let t1 = (min.z - rayOrigin.z) / rayDir.z;
            let t2 = (max.z - rayOrigin.z) / rayDir.z;
            tmin = Math.max(tmin, Math.min(t1, t2));
            tmax = Math.min(tmax, Math.max(t1, t2));
        } else if (rayOrigin.z < min.z || rayOrigin.z > max.z) return null;

        if (tmax >= tmin && tmax > 0) {
            const t = tmin > 0 ? tmin : tmax;
            return {
                distance: t,
                point: {
                    x: rayOrigin.x + rayDir.x * t,
                    y: rayOrigin.y + rayDir.y * t,
                    z: rayOrigin.z + rayDir.z * t
                }
            };
        }

        return null;
    }

    getCompensatedState(clientTimestamp, stateHistory) {
        if (!stateHistory || stateHistory.length === 0) return null;

        let closest = stateHistory[0];
        let minDiff = Math.abs(closest.timestamp - clientTimestamp);

        for (const snapshot of stateHistory) {
            const diff = Math.abs(snapshot.timestamp - clientTimestamp);
            if (diff < minDiff) {
                minDiff = diff;
                closest = snapshot;
            }
        }

        if (minDiff > 250) return null;
        return closest;
    }
}
