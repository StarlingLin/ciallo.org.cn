(() =>
{
    "use strict";

    const config = window.SNAKE_CONFIG;
    const canvas = document.getElementById("game-canvas");
    const ctx = canvas.getContext("2d");

    const scoreValue = document.getElementById("score-value");
    const lengthValue = document.getElementById("length-value");
    const botValue = document.getElementById("bot-value");
    const spawnValue = document.getElementById("spawn-value");
    const skinGrid = document.getElementById("skin-grid");
    const startPanel = document.getElementById("start-panel");
    const pausePanel = document.getElementById("pause-panel");
    const gameOverPanel = document.getElementById("game-over-panel");
    const gameOverTitle = document.getElementById("game-over-title");
    const gameOverDetail = document.getElementById("game-over-detail");
    const spawnToast = document.getElementById("spawn-toast");
    const resultTime = document.getElementById("result-time");
    const resultKills = document.getElementById("result-kills");
    const resultLength = document.getElementById("result-length");
    const startButton = document.getElementById("start-button");
    const resumeButton = document.getElementById("resume-button");
    const retryButton = document.getElementById("retry-button");
    const changeSkinButton = document.getElementById("change-skin-button");
    const muteButton = document.getElementById("mute-button");
    const restartButton = document.getElementById("restart-button");

    const TWO_PI = Math.PI * 2;
    const query = new URLSearchParams(window.location.search);
    const fastBots = query.get("fastBots") === "1";
    const aiObserver = query.get("aiObserver") === "1";
    const bgm = new Audio("assets/audio/be-brand-new.ogg");
    bgm.loop = true;
    bgm.preload = "metadata";
    bgm.volume = 0.28;
    bgm.addEventListener("playing", () =>
    {
        document.body.dataset.bgmState = "playing";
    });
    bgm.addEventListener("pause", () =>
    {
        document.body.dataset.bgmState = "paused";
    });
    bgm.addEventListener("error", () =>
    {
        document.body.dataset.bgmState = "error";
    });
    const imageCache = new Map();
    const keys = new Set();

    let selectedSkinId = readSavedSkin();
    let gameState = "menu";
    let snakes = [];
    let foods = [];
    let particles = [];
    let backgroundMotes = [];
    let player = null;
    let nextSnakeId = 1;
    let score = 0;
    let kills = 0;
    let longestLength = config.player.initialSegments;
    let elapsed = 0;
    let survivalAccumulator = 0;
    let spawnCountdown = config.bot.firstSpawnDelay;
    let toastTimer = 0;
    let lastTimestamp = 0;
    let audioContext = null;
    let muted = false;
    let aiDebugDeaths = [];
    let bgmStarted = false;
    let frenzyActivated = false;

    const camera = { x: 0, y: 0 };
    const pointer = {
        active: false,
        x: config.canvas.width / 2,
        y: config.canvas.height / 2
    };

    function readSavedSkin()
    {
        try
        {
            const saved = window.localStorage.getItem("ciallo-snake-skin");
            if (config.skins.some((skin) => skin.id === saved))
            {
                return saved;
            }
        }
        catch (error)
        {
            // The game remains playable when storage is disabled.
        }

        return config.skins[0].id;
    }

    function saveSelectedSkin()
    {
        try
        {
            window.localStorage.setItem("ciallo-snake-skin", selectedSkinId);
        }
        catch (error)
        {
            // Remembering the visual preference is optional.
        }
    }

    function random(min, max)
    {
        return Math.random() * (max - min) + min;
    }

    function randomInteger(min, max)
    {
        return Math.floor(random(min, max + 1));
    }

    function clamp(value, min, max)
    {
        return Math.max(min, Math.min(max, value));
    }

    function distanceSquared(a, b)
    {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy;
    }

    function normalize(x, y)
    {
        const length = Math.hypot(x, y) || 1;
        return { x: x / length, y: y / length };
    }

    function turnToward(current, target, maximumStep)
    {
        const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
        return current + clamp(difference, -maximumStep, maximumStep);
    }

    function formatTime(seconds)
    {
        const minutes = Math.floor(seconds / 60);
        const remainder = Math.floor(seconds % 60);
        return `${minutes}:${String(remainder).padStart(2, "0")}`;
    }

    function getSkin(id)
    {
        return config.skins.find((skin) => skin.id === id) || config.skins[0];
    }

    function getBotSpeedMultiplier(snake)
    {
        const personality = snake.personality;
        if (!personality)
        {
            return 1;
        }

        const duration = Math.max(1, personality.speedRampSeconds || 1);
        const curveTime = aiObserver ? elapsed * 20 : elapsed;
        const progress = clamp(curveTime / duration, 0, 1);
        const initial = personality.initialSpeedMultiplier || 1;
        const maximum = personality.maximumSpeedMultiplier || initial;
        const personalityMultiplier = initial + (maximum - initial) * progress;
        const frenzyMultiplier = elapsed >= config.bot.frenzyAfterSeconds
            ? config.bot.frenzySpeedMultiplier
            : 1;
        return personalityMultiplier * frenzyMultiplier;
    }

    function getSnakeSpeed(snake)
    {
        if (snake.isPlayer)
        {
            return snake.baseSpeed * (snake.boosting ? config.player.boostMultiplier : 1);
        }

        return snake.baseSpeed * getBotSpeedMultiplier(snake);
    }

    function preloadSkinImages()
    {
        for (const skin of config.skins)
        {
            const image = new Image();
            image.decoding = "async";
            image.src = skin.head;
            imageCache.set(skin.id, image);
        }
    }

    function buildSkinSelector()
    {
        skinGrid.replaceChildren();

        for (const skin of config.skins)
        {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "skin-card";
            button.dataset.skinId = skin.id;
            button.setAttribute("role", "listitem");
            button.setAttribute("aria-pressed", String(skin.id === selectedSkinId));
            button.style.setProperty("--skin-color", skin.bodyA);
            button.style.setProperty("--skin-glow", skin.glow);

            const image = document.createElement("img");
            image.src = skin.head;
            image.alt = "";
            image.width = 92;
            image.height = 92;

            const name = document.createElement("strong");
            name.textContent = skin.name;

            const description = document.createElement("small");
            description.textContent = skin.description;

            button.append(image, name, description);
            button.classList.toggle("is-selected", skin.id === selectedSkinId);
            button.addEventListener("click", () => selectSkin(skin.id));
            skinGrid.append(button);
        }
    }

    function selectSkin(id)
    {
        selectedSkinId = id;
        saveSelectedSkin();

        for (const button of skinGrid.querySelectorAll(".skin-card"))
        {
            const selected = button.dataset.skinId === id;
            button.classList.toggle("is-selected", selected);
            button.setAttribute("aria-pressed", String(selected));
        }

        playTone("select");
    }

    function generateBackgroundMotes()
    {
        backgroundMotes = Array.from({ length: 78 }, (_, index) => ({
            x: random(0, config.world.width),
            y: random(0, config.world.height),
            radius: random(1.1, 3.8),
            alpha: random(0.12, 0.42),
            phase: random(0, TWO_PI),
            layer: index % 3
        }));
    }

    function createSnake(options)
    {
        const segmentCount = options.segmentCount;
        const spacing = config.player.segmentSpacing;
        const segments = [];

        for (let index = 0; index < segmentCount; index++)
        {
            segments.push({
                x: options.x - Math.cos(options.angle) * spacing * index,
                y: options.y - Math.sin(options.angle) * spacing * index
            });
        }

        return {
            id: nextSnakeId++,
            isPlayer: options.isPlayer,
            skin: options.skin,
            personality: options.personality || null,
            segments,
            angle: options.angle,
            desiredAngle: options.angle,
            baseSpeed: options.speed,
            turnRate: options.turnRate,
            headRadius: config.player.headRadius,
            bodyRadius: config.player.bodyRadius,
            alive: true,
            aliveTime: 0,
            currentSpeed: options.speed,
            edgeTurnMultiplier: 1,
            boostDrain: 0,
            boostTrailTimer: 0,
            growthProgress: 0,
            aiDecisionTimer: random(
                config.bot.decisionIntervalMin,
                config.bot.decisionIntervalMax
            ),
            wanderAngle: options.angle + random(-0.8, 0.8)
        };
    }

    function startRound()
    {
        ensureAudio();
        playBgm();
        score = 0;
        kills = 0;
        elapsed = 0;
        survivalAccumulator = 0;
        longestLength = config.player.initialSegments;
        nextSnakeId = 1;
        foods = [];
        particles = [];
        snakes = [];
        aiDebugDeaths = [];
        frenzyActivated = false;
        document.body.classList.remove("is-frenzy");
        canvas.dataset.aiDeaths = "[]";
        pointer.active = false;
        keys.clear();

        const skin = getSkin(selectedSkinId);
        player = createSnake({
            isPlayer: true,
            skin,
            x: config.world.width / 2,
            y: config.world.height / 2,
            angle: random(-Math.PI, Math.PI),
            segmentCount: config.player.initialSegments,
            speed: aiObserver ? 0 : config.player.speed,
            turnRate: config.player.turnRate
        });
        snakes.push(player);

        for (let index = 0; index < config.food.initialCount; index++)
        {
            spawnFood();
        }

        generateBackgroundMotes();
        camera.x = clamp(player.segments[0].x - config.canvas.width / 2, 0, config.world.width - config.canvas.width);
        camera.y = clamp(player.segments[0].y - config.canvas.height / 2, 0, config.world.height - config.canvas.height);
        spawnCountdown = fastBots ? 2.2 : config.bot.firstSpawnDelay;
        gameState = "playing";
        startPanel.hidden = true;
        pausePanel.hidden = true;
        gameOverPanel.hidden = true;
        frenzyActivated = false;
        document.body.classList.remove("is-frenzy");
        canvas.focus({ preventScroll: true });
        updateHud();
    }

    function showSkinMenu()
    {
        gameState = "menu";
        player = null;
        snakes = [];
        foods = [];
        particles = [];
        startPanel.hidden = false;
        pausePanel.hidden = true;
        gameOverPanel.hidden = true;
        spawnValue.textContent = "准备中";
        botValue.textContent = `0 / ${config.bot.maximumAlive}`;
        scoreValue.textContent = "00000";
        lengthValue.textContent = String(config.player.initialSegments);
    }

    function spawnFood(x = null, y = null, dropped = false)
    {
        const margin = config.world.margin + config.bot.edgeHardDistance;
        const palette = dropped
            ? ["#ff85c7", "#ffd77d", "#b58cff"]
            : ["#6de8ce", "#75bfff", "#ff7db7", "#ffd26c", "#a98cff"];

        foods.push({
            x: x === null ? random(margin, config.world.width - margin) : x,
            y: y === null ? random(margin, config.world.height - margin) : y,
            radius: dropped
                ? random(config.food.radiusMin + 1, config.food.radiusMax + 2)
                : random(config.food.radiusMin, config.food.radiusMax),
            color: palette[randomInteger(0, palette.length - 1)],
            value: dropped ? config.food.droppedValue : config.food.normalValue,
            dropped,
            phase: random(0, TWO_PI)
        });
    }

    function getBotCount()
    {
        return snakes.filter((snake) => snake.alive && !snake.isPlayer).length;
    }

    function chooseBotSkin()
    {
        const allowed = config.skins.filter((skin) => skin.id !== selectedSkinId);
        const activeIds = new Set(
            snakes.filter((snake) => snake.alive && !snake.isPlayer).map((snake) => snake.skin.id)
        );
        const unused = allowed.filter((skin) => !activeIds.has(skin.id));
        const pool = unused.length > 0 ? unused : allowed;
        return pool[randomInteger(0, pool.length - 1)];
    }

    function findBotSpawn()
    {
        const margin = config.world.margin + config.bot.edgeHardDistance + 48;
        const playerHead = player.segments[0];
        let fallback = null;

        for (let attempt = 0; attempt < 48; attempt++)
        {
            const side = randomInteger(0, 3);
            const spawn = { x: margin, y: margin, angle: 0 };

            if (side === 0)
            {
                spawn.x = margin;
                spawn.y = random(margin, config.world.height - margin);
                spawn.angle = random(-0.35, 0.35);
            }
            else if (side === 1)
            {
                spawn.x = config.world.width - margin;
                spawn.y = random(margin, config.world.height - margin);
                spawn.angle = Math.PI + random(-0.35, 0.35);
            }
            else if (side === 2)
            {
                spawn.x = random(margin, config.world.width - margin);
                spawn.y = margin;
                spawn.angle = Math.PI / 2 + random(-0.35, 0.35);
            }
            else
            {
                spawn.x = random(margin, config.world.width - margin);
                spawn.y = config.world.height - margin;
                spawn.angle = -Math.PI / 2 + random(-0.35, 0.35);
            }

            fallback = spawn;
            if (distanceSquared(spawn, playerHead) < config.bot.safeSpawnDistance ** 2)
            {
                continue;
            }

            const tooClose = snakes.some((snake) =>
                distanceSquared(spawn, snake.segments[0]) < 260 ** 2
            );
            if (!tooClose)
            {
                return spawn;
            }
        }

        return fallback;
    }

    function spawnBot()
    {
        if (getBotCount() >= config.bot.maximumAlive || !player || !player.alive)
        {
            return;
        }

        const skin = chooseBotSkin();
        const personality = config.personalities[randomInteger(0, config.personalities.length - 1)];
        const spawn = findBotSpawn();
        const difficulty = clamp(elapsed / 150, 0, 1);

        const bot = createSnake({
            isPlayer: false,
            skin,
            personality,
            x: spawn.x,
            y: spawn.y,
            angle: spawn.angle,
            segmentCount: randomInteger(
                config.bot.initialSegmentsMin,
                config.bot.initialSegmentsMax + Math.floor(difficulty * 6)
            ),
            speed: random(config.bot.speedMin, config.bot.speedMax),
            turnRate: (
                random(config.bot.turnRateMin, config.bot.turnRateMax) + difficulty * 0.25
            ) * (personality.turnRateMultiplier || 1)
        });

        snakes.push(bot);
        showToast(`${skin.name}以“${personality.name}”加入地图`);
        playTone("spawn");
    }

    function resetSpawnCountdown()
    {
        if (fastBots)
        {
            spawnCountdown = random(5, 7);
            return;
        }

        spawnCountdown = random(config.bot.spawnIntervalMin, config.bot.spawnIntervalMax);
    }

    function showToast(message)
    {
        spawnToast.textContent = message;
        spawnToast.classList.add("is-visible");
        toastTimer = 2.8;
    }

    function ensureAudio()
    {
        if (audioContext)
        {
            if (audioContext.state === "suspended")
            {
                audioContext.resume().catch(() => {});
            }
            return;
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass)
        {
            audioContext = new AudioContextClass();
        }
    }

    function playBgm()
    {
        if (muted || gameState === "paused")
        {
            return;
        }

        bgm.muted = false;
        bgm.play()
            .then(() =>
            {
                bgmStarted = true;
            })
            .catch(() =>
            {
                // Browsers may refuse playback until the next explicit interaction.
            });
    }

    function playTone(type)
    {
        if (muted || !audioContext || audioContext.state !== "running")
        {
            return;
        }

        const presets = {
            select: [520, 0.06, "sine", 0.025],
            eat: [760, 0.08, "sine", 0.035],
            spawn: [250, 0.2, "triangle", 0.045],
            defeat: [410, 0.16, "square", 0.035],
            death: [105, 0.42, "sawtooth", 0.055]
        };
        const preset = presets[type];
        if (!preset)
        {
            return;
        }

        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const now = audioContext.currentTime;
        oscillator.type = preset[2];
        oscillator.frequency.setValueAtTime(preset[0], now);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(55, preset[0] * 0.72), now + preset[1]);
        gain.gain.setValueAtTime(preset[3], now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + preset[1]);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(now);
        oscillator.stop(now + preset[1]);
    }

    function updatePlayerControl(deltaTime)
    {
        if (!player || !player.alive)
        {
            return;
        }

        const left = keys.has("a") || keys.has("arrowleft");
        const right = keys.has("d") || keys.has("arrowright");
        const up = keys.has("w") || keys.has("arrowup");
        const down = keys.has("s") || keys.has("arrowdown");
        const x = (right ? 1 : 0) - (left ? 1 : 0);
        const y = (down ? 1 : 0) - (up ? 1 : 0);

        if (x !== 0 || y !== 0)
        {
            player.desiredAngle = Math.atan2(y, x);
        }
        else if (pointer.active)
        {
            const headScreenX = player.segments[0].x - camera.x;
            const headScreenY = player.segments[0].y - camera.y;
            player.desiredAngle = Math.atan2(pointer.y - headScreenY, pointer.x - headScreenX);
        }

        const boosting = keys.has(" ") && player.segments.length > config.player.minimumBoostSegments;
        if (boosting)
        {
            player.boostDrain += deltaTime;
            player.boostTrailTimer -= deltaTime;

            if (player.boostTrailTimer <= 0)
            {
                const tail = player.segments[player.segments.length - 1];
                createParticleBurst(tail.x, tail.y, player.skin.bodyA, 2, 0.45, 35);
                player.boostTrailTimer = 0.05;
            }

            if (player.boostDrain >= config.player.boostDrainInterval)
            {
                player.boostDrain = 0;
                if (player.segments.length > config.player.minimumBoostSegments)
                {
                    player.segments.pop();
                }
            }
        }
        else
        {
            player.boostDrain = 0;
        }

        player.boosting = boosting;
    }

    function getWorldEdgeDistance(point)
    {
        return Math.min(
            point.x - config.world.margin,
            config.world.width - config.world.margin - point.x,
            point.y - config.world.margin,
            config.world.height - config.world.margin - point.y
        );
    }

    function getEdgePressure(point, softDistance)
    {
        const leftDistance = point.x - config.world.margin;
        const rightDistance = config.world.width - config.world.margin - point.x;
        const topDistance = point.y - config.world.margin;
        const bottomDistance = config.world.height - config.world.margin - point.y;
        const pressureFor = (distance) =>
            clamp((softDistance - distance) / softDistance, 0, 1.35) ** 2;
        const left = pressureFor(leftDistance);
        const right = pressureFor(rightDistance);
        const top = pressureFor(topDistance);
        const bottom = pressureFor(bottomDistance);

        return {
            x: left - right,
            y: top - bottom,
            maximum: Math.max(left, right, top, bottom),
            minimumDistance: Math.min(leftDistance, rightDistance, topDistance, bottomDistance)
        };
    }

    function getBotBoundaryResponse(snake)
    {
        const head = snake.segments[0];
        const speed = getSnakeSpeed(snake);
        const softDistance = Math.max(
            config.bot.edgeSoftDistance,
            speed * config.bot.edgeLookAheadTime
        );
        const projected = {
            x: head.x + Math.cos(snake.angle) * speed * config.bot.edgeLookAheadTime,
            y: head.y + Math.sin(snake.angle) * speed * config.bot.edgeLookAheadTime
        };
        const current = getEdgePressure(head, softDistance);
        const future = getEdgePressure(projected, softDistance);

        return {
            x: current.x * config.bot.edgeWeight + future.x * config.bot.edgePredictionWeight,
            y: current.y * config.bot.edgeWeight + future.y * config.bot.edgePredictionWeight,
            pressure: Math.max(current.maximum, future.maximum),
            critical:
                current.minimumDistance < config.bot.edgeHardDistance ||
                future.minimumDistance < config.bot.edgeHardDistance
        };
    }

    function updateBotDecision(snake, deltaTime)
    {
        snake.aiDecisionTimer -= deltaTime;
        if (snake.aiDecisionTimer > 0)
        {
            return;
        }

        snake.aiDecisionTimer = random(
            config.bot.decisionIntervalMin,
            config.bot.decisionIntervalMax
        );

        const head = snake.segments[0];
        const personality = snake.personality;
        const boundary = getBotBoundaryResponse(snake);
        let steerX = boundary.x;
        let steerY = boundary.y;
        let nearestFood = null;
        let nearestFoodDistance = Infinity;

        snake.edgeTurnMultiplier = 1 + boundary.pressure * (
            config.bot.edgeEmergencyTurnMultiplier - 1
        );

        if (boundary.critical)
        {
            const towardCenter = normalize(
                config.world.width / 2 - head.x,
                config.world.height / 2 - head.y
            );
            steerX += towardCenter.x * config.bot.edgePredictionWeight;
            steerY += towardCenter.y * config.bot.edgePredictionWeight;
            snake.edgeTurnMultiplier = config.bot.edgeEmergencyTurnMultiplier;
            snake.desiredAngle = Math.atan2(steerY, steerX);
            return;
        }

        for (const food of foods)
        {
            if (getWorldEdgeDistance(food) < config.bot.edgeHardDistance)
            {
                continue;
            }

            const d2 = distanceSquared(head, food);
            const valueBias = food.dropped ? 0.6 : 1;
            if (d2 * valueBias < nearestFoodDistance)
            {
                nearestFoodDistance = d2 * valueBias;
                nearestFood = food;
            }
        }

        if (nearestFood)
        {
            const towardFood = normalize(nearestFood.x - head.x, nearestFood.y - head.y);
            steerX += towardFood.x * personality.foodWeight;
            steerY += towardFood.y * personality.foodWeight;
        }

        const avoidRange = 205;
        const avoidRangeSquared = avoidRange * avoidRange;
        for (const other of snakes)
        {
            if (!other.alive || (aiObserver && other.isPlayer))
            {
                continue;
            }

            const startIndex = other === snake ? 7 : 1;
            for (let index = startIndex; index < other.segments.length; index += 2)
            {
                const segment = other.segments[index];
                const d2 = distanceSquared(head, segment);
                if (d2 >= avoidRangeSquared || d2 < 1)
                {
                    continue;
                }

                const distance = Math.sqrt(d2);
                const away = normalize(head.x - segment.x, head.y - segment.y);
                const urgency = (1 - distance / avoidRange) ** 2 * personality.avoidWeight * 3.4;
                steerX += away.x * urgency;
                steerY += away.y * urgency;
            }
        }

        if (personality.huntWeight > 0.2)
        {
            let target = null;
            let targetDistance = Infinity;
            for (const other of snakes)
            {
                if (
                    other === snake ||
                    !other.alive ||
                    (aiObserver && other.isPlayer) ||
                    other.segments.length > snake.segments.length + 6
                )
                {
                    continue;
                }

                const d2 = distanceSquared(head, other.segments[0]);
                if (d2 < targetDistance && d2 < 720 ** 2)
                {
                    target = other;
                    targetDistance = d2;
                }
            }

            if (target)
            {
                const lead = 90;
                const targetHead = target.segments[0];
                const targetX = targetHead.x + Math.cos(target.angle) * lead;
                const targetY = targetHead.y + Math.sin(target.angle) * lead;
                const hunt = normalize(targetX - head.x, targetY - head.y);
                steerX += hunt.x * personality.huntWeight;
                steerY += hunt.y * personality.huntWeight;
            }
        }

        snake.wanderAngle += random(-0.36, 0.36);
        steerX += Math.cos(snake.wanderAngle) * personality.wanderWeight;
        steerY += Math.sin(snake.wanderAngle) * personality.wanderWeight;

        if (Math.abs(steerX) + Math.abs(steerY) > 0.001)
        {
            snake.desiredAngle = Math.atan2(steerY, steerX);
        }
    }

    function moveSnake(snake, deltaTime)
    {
        snake.aliveTime += deltaTime;
        const maximumTurn = snake.turnRate * snake.edgeTurnMultiplier * deltaTime;
        snake.angle = turnToward(snake.angle, snake.desiredAngle, maximumTurn);
        const speed = getSnakeSpeed(snake);
        snake.currentSpeed = speed;
        const head = snake.segments[0];
        let nextX = head.x + Math.cos(snake.angle) * speed * deltaTime;
        let nextY = head.y + Math.sin(snake.angle) * speed * deltaTime;

        if (!snake.isPlayer)
        {
            const safeMargin = config.world.margin + snake.headRadius + config.bot.edgeEmergencyInset;
            const maximumX = config.world.width - safeMargin;
            const maximumY = config.world.height - safeMargin;
            let corrected = false;

            if (nextX < safeMargin)
            {
                nextX = safeMargin;
                snake.angle = Math.atan2(Math.sin(snake.angle), Math.abs(Math.cos(snake.angle)));
                corrected = true;
            }
            else if (nextX > maximumX)
            {
                nextX = maximumX;
                snake.angle = Math.atan2(Math.sin(snake.angle), -Math.abs(Math.cos(snake.angle)));
                corrected = true;
            }

            if (nextY < safeMargin)
            {
                nextY = safeMargin;
                snake.angle = Math.atan2(Math.abs(Math.sin(snake.angle)), Math.cos(snake.angle));
                corrected = true;
            }
            else if (nextY > maximumY)
            {
                nextY = maximumY;
                snake.angle = Math.atan2(-Math.abs(Math.sin(snake.angle)), Math.cos(snake.angle));
                corrected = true;
            }

            if (corrected)
            {
                snake.desiredAngle = Math.atan2(
                    config.world.height / 2 - nextY,
                    config.world.width / 2 - nextX
                );
                snake.edgeTurnMultiplier = config.bot.edgeEmergencyTurnMultiplier;
            }
        }

        head.x = nextX;
        head.y = nextY;

        const spacing = config.player.segmentSpacing;
        for (let index = 1; index < snake.segments.length; index++)
        {
            const previous = snake.segments[index - 1];
            const segment = snake.segments[index];
            const dx = previous.x - segment.x;
            const dy = previous.y - segment.y;
            const distance = Math.hypot(dx, dy) || 1;

            if (distance > spacing)
            {
                segment.x = previous.x - dx / distance * spacing;
                segment.y = previous.y - dy / distance * spacing;
            }
        }
    }

    function updateFoodCollisions()
    {
        for (const snake of snakes)
        {
            if (!snake.alive)
            {
                continue;
            }

            const head = snake.segments[0];
            for (let index = foods.length - 1; index >= 0; index--)
            {
                const food = foods[index];
                const collisionDistance = snake.headRadius + food.radius + 1;
                if (distanceSquared(head, food) > collisionDistance * collisionDistance)
                {
                    continue;
                }

                foods.splice(index, 1);
                snake.growthProgress += food.value;
                while (snake.growthProgress >= config.food.growthEveryScore)
                {
                    snake.growthProgress -= config.food.growthEveryScore;
                    growSnake(snake, 1);
                }

                createParticleBurst(food.x, food.y, food.color, food.dropped ? 10 : 6, 0.55, 75);
                if (snake.isPlayer)
                {
                    score += food.value;
                    playTone("eat");
                }
            }
        }

        while (foods.length < config.food.minimumCount)
        {
            spawnFood();
        }
    }

    function growSnake(snake, count)
    {
        for (let index = 0; index < count; index++)
        {
            const tail = snake.segments[snake.segments.length - 1];
            snake.segments.push({ x: tail.x, y: tail.y });
        }
    }

    function checkCollisions()
    {
        const living = snakes.filter((snake) => snake.alive);

        for (const snake of living)
        {
            const head = snake.segments[0];
            if (
                head.x < config.world.margin ||
                head.x > config.world.width - config.world.margin ||
                head.y < config.world.margin ||
                head.y > config.world.height - config.world.margin
            )
            {
                killSnake(snake, null, "撞上了地图边界");
            }
        }

        for (let firstIndex = 0; firstIndex < living.length; firstIndex++)
        {
            const first = living[firstIndex];
            if (!first.alive) continue;

            for (let secondIndex = firstIndex + 1; secondIndex < living.length; secondIndex++)
            {
                const second = living[secondIndex];
                if (!second.alive) continue;
                if (aiObserver && (first.isPlayer || second.isPlayer)) continue;

                const collisionDistance = (first.headRadius + second.headRadius) * 0.72;
                if (distanceSquared(first.segments[0], second.segments[0]) > collisionDistance ** 2)
                {
                    continue;
                }

                const difference = first.segments.length - second.segments.length;
                if (Math.abs(difference) <= 2)
                {
                    killSnake(first, second, "与对手正面相撞");
                    killSnake(second, first, "与对手正面相撞");
                }
                else if (difference > 0)
                {
                    killSnake(second, first, "正面撞上了更长的对手");
                }
                else
                {
                    killSnake(first, second, "正面撞上了更长的对手");
                }
            }
        }

        for (const snake of living)
        {
            if (!snake.alive) continue;
            if (aiObserver && snake.isPlayer) continue;
            const head = snake.segments[0];
            let collided = false;

            for (const other of living)
            {
                if (!other.alive || collided) continue;
                if (aiObserver && other.isPlayer) continue;
                const startIndex = other === snake ? 8 : 2;
                const collisionDistance = snake.headRadius * 0.66 + other.bodyRadius * 0.64;

                for (let segmentIndex = startIndex; segmentIndex < other.segments.length; segmentIndex++)
                {
                    if (distanceSquared(head, other.segments[segmentIndex]) <= collisionDistance ** 2)
                    {
                        killSnake(
                            snake,
                            other === snake ? null : other,
                            other === snake ? "绕回了自己的蛇身" : "撞上了其他蛇的身体"
                        );
                        collided = true;
                        break;
                    }
                }
            }
        }

        snakes = snakes.filter((snake) => snake.alive);
    }

    function killSnake(snake, killer, reason)
    {
        if (!snake.alive)
        {
            return;
        }

        snake.alive = false;
        if (aiObserver && !snake.isPlayer)
        {
            aiDebugDeaths.push(reason);
            canvas.dataset.aiDeaths = JSON.stringify(aiDebugDeaths);
        }
        for (let index = 0; index < snake.segments.length; index += config.food.droppedStride)
        {
            const segment = snake.segments[index];
            spawnFood(
                segment.x + random(-5, 5),
                segment.y + random(-5, 5),
                true
            );
        }

        const head = snake.segments[0];
        createParticleBurst(head.x, head.y, snake.skin.bodyA, 28, 0.9, 165);

        if (killer && killer.isPlayer && !snake.isPlayer)
        {
            score += config.score.botDefeat;
            kills++;
            showToast(`击败 ${snake.skin.name}，获得 ${config.score.botDefeat} 分`);
            playTone("defeat");
        }

        if (snake.isPlayer)
        {
            playTone("death");
            endRound(reason);
        }
    }

    function endRound(reason)
    {
        gameState = "gameover";
        gameOverTitle.textContent = reason.includes("自己") ? "绕晕了！" : "撞到了！";
        gameOverDetail.textContent = `${reason}，本局得分 ${Math.floor(score)}`;
        resultTime.textContent = formatTime(elapsed);
        resultKills.textContent = String(kills);
        resultLength.textContent = String(longestLength);
        gameOverPanel.hidden = false;
        pausePanel.hidden = true;
        keys.clear();
        updateHud();
        window.CialloLeaderboard?.reportScore(Math.floor(score), {
            skinId: selectedSkinId,
            survivalSeconds: Math.floor(elapsed)
        });
    }

    function createParticleBurst(x, y, color, count, lifetime, speed)
    {
        for (let index = 0; index < count; index++)
        {
            const angle = random(0, TWO_PI);
            const velocity = random(speed * 0.25, speed);
            particles.push({
                x,
                y,
                vx: Math.cos(angle) * velocity,
                vy: Math.sin(angle) * velocity,
                radius: random(1.5, 4.5),
                color,
                life: lifetime,
                maximumLife: lifetime
            });
        }
    }

    function updateParticles(deltaTime)
    {
        for (const particle of particles)
        {
            particle.x += particle.vx * deltaTime;
            particle.y += particle.vy * deltaTime;
            particle.vx *= Math.pow(0.08, deltaTime);
            particle.vy *= Math.pow(0.08, deltaTime);
            particle.life -= deltaTime;
        }
        particles = particles.filter((particle) => particle.life > 0);
    }

    function updateCamera(deltaTime)
    {
        if (!player || !player.alive)
        {
            return;
        }

        const targetX = clamp(
            player.segments[0].x - config.canvas.width / 2,
            0,
            config.world.width - config.canvas.width
        );
        const targetY = clamp(
            player.segments[0].y - config.canvas.height / 2,
            0,
            config.world.height - config.canvas.height
        );
        const smoothing = 1 - Math.exp(-deltaTime * 6.4);
        camera.x += (targetX - camera.x) * smoothing;
        camera.y += (targetY - camera.y) * smoothing;
    }

    function update(deltaTime)
    {
        elapsed += deltaTime;
        if (!frenzyActivated && elapsed >= config.bot.frenzyAfterSeconds)
        {
            frenzyActivated = true;
            document.body.classList.add("is-frenzy");
            showToast("狂暴模式！所有 AI 蛇速度提升 50%");
            playTone("defeat");
        }
        survivalAccumulator += deltaTime;
        if (survivalAccumulator >= 1)
        {
            const seconds = Math.floor(survivalAccumulator);
            survivalAccumulator -= seconds;
            score += seconds * config.score.survivalPerSecond;
        }

        if (toastTimer > 0)
        {
            toastTimer -= deltaTime;
            if (toastTimer <= 0)
            {
                spawnToast.classList.remove("is-visible");
            }
        }

        spawnCountdown -= deltaTime;
        if (spawnCountdown <= 0)
        {
            if (getBotCount() < config.bot.maximumAlive)
            {
                spawnBot();
                resetSpawnCountdown();
            }
            else
            {
                spawnCountdown = 3;
            }
        }

        updatePlayerControl(deltaTime);
        for (const snake of snakes)
        {
            if (!snake.isPlayer && snake.alive)
            {
                updateBotDecision(snake, deltaTime);
            }
            if (snake.alive)
            {
                moveSnake(snake, deltaTime);
            }
        }

        updateFoodCollisions();
        checkCollisions();
        updateParticles(deltaTime);
        updateCamera(deltaTime);

        if (player)
        {
            longestLength = Math.max(longestLength, player.segments.length);
        }
        updateHud();
    }

    function updateHud()
    {
        scoreValue.textContent = String(Math.floor(score)).padStart(5, "0");
        lengthValue.textContent = String(player ? player.segments.length : config.player.initialSegments);
        botValue.textContent = `${getBotCount()} / ${config.bot.maximumAlive}`;

        if (gameState !== "playing")
        {
            spawnValue.textContent = gameState === "gameover" ? "本局结束" : "准备中";
        }
        else if (getBotCount() >= config.bot.maximumAlive)
        {
            spawnValue.textContent = "场上已满";
        }
        else
        {
            spawnValue.textContent = `${Math.max(0, Math.ceil(spawnCountdown))} 秒`;
        }
    }

    function isOnScreen(point, padding = 50)
    {
        const x = point.x - camera.x;
        const y = point.y - camera.y;
        return x > -padding && y > -padding && x < config.canvas.width + padding && y < config.canvas.height + padding;
    }

    function drawBackground(time)
    {
        const background = ctx.createLinearGradient(0, 0, config.canvas.width, config.canvas.height);
        background.addColorStop(0, "#10142b");
        background.addColorStop(0.5, "#080c1c");
        background.addColorStop(1, "#111026");
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, config.canvas.width, config.canvas.height);

        const gridSize = config.world.gridSize;
        const startX = -(camera.x % gridSize);
        const startY = -(camera.y % gridSize);
        ctx.strokeStyle = "rgba(156, 165, 255, 0.055)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = startX; x < config.canvas.width; x += gridSize)
        {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, config.canvas.height);
        }
        for (let y = startY; y < config.canvas.height; y += gridSize)
        {
            ctx.moveTo(0, y);
            ctx.lineTo(config.canvas.width, y);
        }
        ctx.stroke();

        for (const mote of backgroundMotes)
        {
            const parallax = 0.82 + mote.layer * 0.07;
            const x = mote.x - camera.x * parallax;
            const y = mote.y - camera.y * parallax;
            if (x < -10 || y < -10 || x > config.canvas.width + 10 || y > config.canvas.height + 10)
            {
                continue;
            }

            ctx.globalAlpha = mote.alpha * (0.72 + Math.sin(time * 1.2 + mote.phase) * 0.28);
            ctx.fillStyle = mote.layer === 0 ? "#8dece1" : mote.layer === 1 ? "#ff83c3" : "#a995ff";
            ctx.beginPath();
            ctx.arc(x, y, mote.radius, 0, TWO_PI);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        const left = -camera.x + config.world.margin;
        const top = -camera.y + config.world.margin;
        const width = config.world.width - config.world.margin * 2;
        const height = config.world.height - config.world.margin * 2;
        ctx.save();
        ctx.strokeStyle = "rgba(255, 114, 182, 0.42)";
        ctx.shadowColor = "rgba(151, 105, 255, 0.55)";
        ctx.shadowBlur = 18;
        ctx.lineWidth = 4;
        ctx.strokeRect(left, top, width, height);
        ctx.restore();
    }

    function drawFoods(time)
    {
        for (const food of foods)
        {
            if (!isOnScreen(food, 20)) continue;
            const x = food.x - camera.x;
            const y = food.y - camera.y;
            const pulse = 1 + Math.sin(time * 3 + food.phase) * 0.12;

            ctx.save();
            ctx.globalAlpha = food.dropped ? 0.92 : 0.78;
            ctx.shadowColor = food.color;
            ctx.shadowBlur = food.dropped ? 15 : 9;
            ctx.fillStyle = food.color;
            ctx.beginPath();
            ctx.arc(x, y, food.radius * pulse, 0, TWO_PI);
            ctx.fill();
            ctx.globalAlpha = 0.86;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(x - food.radius * 0.28, y - food.radius * 0.3, Math.max(1, food.radius * 0.24), 0, TWO_PI);
            ctx.fill();
            ctx.restore();
        }
    }

    function drawSnake(snake)
    {
        if (!snake.alive || snake.segments.length === 0)
        {
            return;
        }

        ctx.save();
        ctx.shadowColor = snake.skin.glow;
        ctx.shadowBlur = 12;
        for (let index = snake.segments.length - 1; index >= 1; index--)
        {
            const segment = snake.segments[index];
            if (!isOnScreen(segment, 30)) continue;
            const progress = index / Math.max(1, snake.segments.length - 1);
            const radius = snake.bodyRadius * (1 - progress * 0.37);
            const x = segment.x - camera.x;
            const y = segment.y - camera.y;

            ctx.fillStyle = index % 2 === 0 ? snake.skin.bodyA : snake.skin.bodyB;
            ctx.beginPath();
            ctx.arc(x, y, Math.max(4.5, radius), 0, TWO_PI);
            ctx.fill();

            ctx.globalAlpha = 0.32;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(x - radius * 0.24, y - radius * 0.28, Math.max(1.2, radius * 0.23), 0, TWO_PI);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.restore();

        const head = snake.segments[0];
        if (!isOnScreen(head, 50)) return;
        const x = head.x - camera.x;
        const y = head.y - camera.y;
        const image = imageCache.get(snake.skin.id);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(snake.angle);
        ctx.shadowColor = snake.skin.glow;
        ctx.shadowBlur = snake.isPlayer ? 20 : 13;
        ctx.fillStyle = snake.skin.bodyA;
        ctx.beginPath();
        ctx.arc(0, 0, snake.headRadius + 3, 0, TWO_PI);
        ctx.fill();

        if (image && image.complete && image.naturalWidth > 0)
        {
            const size = snake.headRadius * 2.72;
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, snake.headRadius + 1, 0, TWO_PI);
            ctx.clip();
            ctx.drawImage(image, -size / 2, -size / 2, size, size);
            ctx.restore();
        }
        else
        {
            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(5, -5, 3, 0, TWO_PI);
            ctx.arc(5, 5, 3, 0, TWO_PI);
            ctx.fill();
        }
        ctx.restore();

        ctx.save();
        ctx.font = `700 ${snake.isPlayer ? 13 : 11}px "Segoe UI", sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = snake.isPlayer ? "#ffffff" : "rgba(238, 236, 255, 0.82)";
        ctx.shadowColor = "#050611";
        ctx.shadowBlur = 5;
        const label = snake.isPlayer
            ? `${snake.skin.name} · YOU`
            : `${snake.skin.name} · ${snake.personality.name}`;
        ctx.fillText(label, x, y - snake.headRadius - 14);
        ctx.restore();
    }

    function drawParticles()
    {
        for (const particle of particles)
        {
            if (!isOnScreen(particle, 20)) continue;
            ctx.globalAlpha = clamp(particle.life / particle.maximumLife, 0, 1);
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.arc(
                particle.x - camera.x,
                particle.y - camera.y,
                particle.radius,
                0,
                TWO_PI
            );
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawMinimap()
    {
        if (!player)
        {
            return;
        }

        const width = 154;
        const height = 92;
        const x = config.canvas.width - width - 18;
        const y = config.canvas.height - height - 18;
        ctx.save();
        ctx.fillStyle = "rgba(7, 9, 20, 0.72)";
        ctx.strokeStyle = "rgba(198, 191, 255, 0.22)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 12);
        ctx.fill();
        ctx.stroke();

        for (const snake of snakes)
        {
            if (!snake.alive) continue;
            const head = snake.segments[0];
            const dotX = x + head.x / config.world.width * width;
            const dotY = y + head.y / config.world.height * height;
            ctx.fillStyle = snake.isPlayer ? "#ffffff" : snake.skin.bodyA;
            ctx.shadowColor = snake.skin.bodyA;
            ctx.shadowBlur = snake.isPlayer ? 8 : 4;
            ctx.beginPath();
            ctx.arc(dotX, dotY, snake.isPlayer ? 3.5 : 2.5, 0, TWO_PI);
            ctx.fill();
        }
        ctx.restore();
    }

    function draw(time)
    {
        drawBackground(time);
        drawFoods(time);
        const orderedSnakes = [...snakes].sort((first, second) => Number(first.isPlayer) - Number(second.isPlayer));
        for (const snake of orderedSnakes)
        {
            drawSnake(snake);
        }
        drawParticles();
        drawMinimap();
    }

    function drawMenuBackdrop(time)
    {
        if (backgroundMotes.length === 0)
        {
            generateBackgroundMotes();
        }
        camera.x = Math.sin(time * 0.08) * 80 + 120;
        camera.y = Math.cos(time * 0.07) * 50 + 80;
        drawBackground(time);
    }

    function animationFrame(timestamp)
    {
        if (!lastTimestamp)
        {
            lastTimestamp = timestamp;
        }
        const deltaTime = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
        lastTimestamp = timestamp;
        const time = timestamp / 1000;

        if (gameState === "playing")
        {
            update(deltaTime);
            draw(time);
        }
        else if (gameState === "menu")
        {
            drawMenuBackdrop(time);
        }
        else
        {
            draw(time);
            updateParticles(deltaTime);
        }

        window.requestAnimationFrame(animationFrame);
    }

    function togglePause(forcePause = null)
    {
        if (gameState !== "playing" && gameState !== "paused")
        {
            return;
        }

        const shouldPause = forcePause === null ? gameState === "playing" : forcePause;
        if (shouldPause)
        {
            gameState = "paused";
            pausePanel.hidden = false;
            keys.clear();
            bgm.pause();
        }
        else
        {
            gameState = "playing";
            pausePanel.hidden = true;
            canvas.focus({ preventScroll: true });
            playBgm();
        }
        updateHud();
    }

    function updatePointer(event)
    {
        const rect = canvas.getBoundingClientRect();
        pointer.x = (event.clientX - rect.left) * config.canvas.width / rect.width;
        pointer.y = (event.clientY - rect.top) * config.canvas.height / rect.height;
        pointer.active = true;
    }

    document.addEventListener("keydown", (event) =>
    {
        const key = event.key.toLowerCase();
        if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key))
        {
            event.preventDefault();
        }

        if ((key === "p" || key === "escape") && !event.repeat)
        {
            togglePause();
            return;
        }

        keys.add(key);
    });

    document.addEventListener("keyup", (event) =>
    {
        keys.delete(event.key.toLowerCase());
    });

    canvas.addEventListener("pointermove", updatePointer);
    canvas.addEventListener("pointerdown", (event) =>
    {
        updatePointer(event);
        canvas.setPointerCapture?.(event.pointerId);
        canvas.focus({ preventScroll: true });
    });
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());

    document.addEventListener("visibilitychange", () =>
    {
        if (document.hidden && gameState === "playing")
        {
            togglePause(true);
        }
    });

    startButton.addEventListener("click", startRound);
    retryButton.addEventListener("click", startRound);
    resumeButton.addEventListener("click", () => togglePause(false));
    changeSkinButton.addEventListener("click", showSkinMenu);
    restartButton.addEventListener("click", startRound);
    muteButton.addEventListener("click", () =>
    {
        ensureAudio();
        muted = !muted;
        bgm.muted = muted;
        if (muted)
        {
            bgm.pause();
        }
        muteButton.setAttribute("aria-pressed", String(muted));
        muteButton.textContent = muted ? "× 声音关闭" : "♪ 声音开启";
        if (!muted)
        {
            playTone("select");
            if (gameState === "playing" || bgmStarted)
            {
                playBgm();
            }
        }
    });

    preloadSkinImages();
    buildSkinSelector();
    showSkinMenu();
    window.requestAnimationFrame(animationFrame);
})();
