(() => {
    "use strict";

    const config = window.RUNNER_CONFIG;
    const canvas = document.getElementById("game-canvas");
    const context = canvas.getContext("2d");
    const scoreElement = document.getElementById("score");
    const stageMessage = document.getElementById("stage-message");
    const stageMessageText = document.getElementById("stage-message-text");
    const stageAction = document.getElementById("stage-action");
    const specialEvent = document.getElementById("special-event");
    const specialEventImage = document.getElementById("special-event-image");
    const specialEventText = document.getElementById("special-event-text");
    const jumpButton = document.getElementById("jump-button");
    const muteButton = document.getElementById("mute-button");
    const muteIcon = document.getElementById("mute-icon");
    const muteLabel = document.getElementById("mute-label");
    const resetButton = document.getElementById("reset-button");

    const world = {
        width: config.canvas.width,
        height: config.canvas.height
    };

    const images = {
        background: null,
        player: null,
        death: null,
        obstacles: new Map()
    };
    const obstacles = [];
    const sounds = {};
    const player = {
        y: 0,
        velocityY: 0,
        jumping: false
    };

    let assetsReady = false;
    let gameOver = false;
    let muted = false;
    let score = 0;
    let lastScoreRendered = -1;
    let lastTimestamp = 0;
    let lastMilestone = 0;
    let backgroundOffset = 0;
    let distanceSinceSpawn = 0;
    let nextObstacleGap = config.obstacle.firstGap;
    let devicePixelRatio = 1;
    let bgmStarted = false;
    let deathImagePromise = null;

    function playerGroundTop() {
        return config.scene.groundY
            - config.player.drawHeight
            + config.player.groundOverlap;
    }

    function configureCanvas() {
        devicePixelRatio = Math.min(
            window.devicePixelRatio || 1,
            config.canvas.maxDevicePixelRatio
        );

        canvas.width = Math.round(world.width * devicePixelRatio);
        canvas.height = Math.round(world.height * devicePixelRatio);
        canvas.style.aspectRatio = `${world.width} / ${world.height}`;
        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    function loadImage(source) {
        return new Promise((resolve) => {
            const image = new Image();
            image.addEventListener("load", () => resolve(image), { once: true });
            image.addEventListener("error", () => resolve(null), { once: true });
            image.src = source;
        });
    }

    function configureAudio() {
        Object.entries(config.audio).forEach(([name, source]) => {
            if (name === "volume" || name === "bgmVolume" || !source) {
                return;
            }

            const audio = new Audio(source);
            audio.preload = name === "bgm" ? "metadata" : "auto";
            audio.volume = name === "bgm"
                ? config.audio.bgmVolume
                : config.audio.volume;
            audio.loop = name === "bgm";
            sounds[name] = audio;
        });
    }

    function startBgm() {
        const bgm = sounds.bgm;
        if (!bgm || muted || bgmStarted) {
            return;
        }

        bgmStarted = true;
        bgm.play().catch(() => {
            // 自动播放被阻止时，在下一次玩家交互时重试。
            bgmStarted = false;
        });
    }

    function playSound(name) {
        const audio = sounds[name];
        if (!audio || muted) {
            return;
        }

        audio.currentTime = 0;
        audio.play().catch(() => {
            // 浏览器可能在首次用户交互前阻止音频，游戏本身继续运行。
        });
    }

    function ensureDeathImage() {
        if (images.death || deathImagePromise) {
            return;
        }

        deathImagePromise = loadImage(config.death.image).then((image) => {
            images.death = image;
        });
    }

    function randomObstacleGap() {
        const minimum = config.obstacle.minGap;
        const maximum = config.obstacle.maxGap;
        const distribution = Math.pow(Math.random(), 0.82);
        return minimum + distribution * (maximum - minimum);
    }

    function randomObstacleVariant() {
        const variants = config.obstacle.variants;
        return variants[Math.floor(Math.random() * variants.length)];
    }

    function resetGame() {
        obstacles.length = 0;
        player.y = playerGroundTop();
        player.velocityY = 0;
        player.jumping = false;
        score = 0;
        lastScoreRendered = -1;
        lastMilestone = 0;
        lastTimestamp = 0;
        backgroundOffset = 0;
        distanceSinceSpawn = 0;
        nextObstacleGap = config.obstacle.firstGap;
        gameOver = false;

        stageMessage.classList.remove("is-special");
        specialEvent.hidden = true;
        stageMessageText.hidden = false;
        stageAction.hidden = true;
        stageMessage.hidden = true;

        renderScore();
        canvas.focus({ preventScroll: true });
    }

    function jump() {
        startBgm();

        if (!assetsReady) {
            return;
        }

        if (gameOver) {
            resetGame();
            return;
        }

        if (player.jumping) {
            return;
        }

        player.jumping = true;
        player.velocityY = config.player.jumpVelocity;
        playSound("jump");
    }

    function spawnObstacle() {
        const variant = randomObstacleVariant();
        const image = images.obstacles.get(variant.id);
        const aspectRatio = image
            ? image.naturalWidth / image.naturalHeight
            : variant.aspectRatio;
        const height = config.obstacle.drawHeight;
        const width = height * aspectRatio;

        obstacles.push({
            x: world.width + width,
            y: config.scene.groundY - height + config.obstacle.groundOverlap,
            width,
            height,
            variant
        });
    }

    function getPlayerHitbox() {
        const box = config.player.hitbox;
        return {
            left: config.player.x + box.left,
            top: player.y + box.top,
            right: config.player.x + config.player.drawWidth - box.right,
            bottom: player.y + config.player.drawHeight - box.bottom
        };
    }

    function getObstacleHitbox(obstacle) {
        const box = obstacle.variant.hitbox;
        return {
            left: obstacle.x + obstacle.width * box.left,
            top: obstacle.y + obstacle.height * box.top,
            right: obstacle.x + obstacle.width * (1 - box.right),
            bottom: obstacle.y + obstacle.height * (1 - box.bottom)
        };
    }

    function overlaps(first, second) {
        return first.left < second.right
            && first.right > second.left
            && first.top < second.bottom
            && first.bottom > second.top;
    }

    function finishGame() {
        if (gameOver) {
            return;
        }

        gameOver = true;
        playSound("hit");
        ensureDeathImage();

        const finalScore = Math.floor(score);
        const isSpecialScore = finalScore === config.specialScore.value;

        stageMessage.classList.toggle("is-special", isSpecialScore);
        specialEvent.hidden = !isSpecialScore;
        stageMessageText.hidden = isSpecialScore;

        if (isSpecialScore) {
            specialEventImage.src = config.specialScore.image;
            specialEventText.textContent = config.specialScore.message;
        } else {
            stageMessageText.textContent = `撞到了！本局得分 ${finalScore}`;
        }

        stageAction.hidden = false;
        stageMessage.hidden = false;
        window.CialloLeaderboard?.reportScore(finalScore);
    }

    function currentObstacleSpeed() {
        return Math.min(
            config.obstacle.baseSpeed + score * config.obstacle.accelerationPerPoint,
            config.obstacle.maxSpeed
        );
    }

    function update(deltaSeconds) {
        score += config.scene.scorePerSecond * deltaSeconds;
        renderScore();

        const roundedScore = Math.floor(score);
        const milestone = Math.floor(roundedScore / 100);
        if (milestone > lastMilestone) {
            lastMilestone = milestone;
            playSound("milestone");
        }

        if (player.jumping) {
            player.velocityY += config.player.gravity * deltaSeconds;
            player.y += player.velocityY * deltaSeconds;

            if (player.y >= playerGroundTop()) {
                player.y = playerGroundTop();
                player.velocityY = 0;
                player.jumping = false;
            }
        }

        const obstacleSpeed = currentObstacleSpeed();
        backgroundOffset += obstacleSpeed * config.background.scrollFactor * deltaSeconds;
        distanceSinceSpawn += obstacleSpeed * deltaSeconds;

        if (distanceSinceSpawn >= nextObstacleGap) {
            spawnObstacle();
            distanceSinceSpawn = 0;
            nextObstacleGap = randomObstacleGap();
        }

        const playerHitbox = getPlayerHitbox();

        for (let index = obstacles.length - 1; index >= 0; index -= 1) {
            const obstacle = obstacles[index];
            obstacle.x -= obstacleSpeed * deltaSeconds;

            if (obstacle.x + obstacle.width < 0) {
                obstacles.splice(index, 1);
                continue;
            }

            if (overlaps(playerHitbox, getObstacleHitbox(obstacle))) {
                finishGame();
                break;
            }
        }
    }

    function renderScore() {
        const roundedScore = Math.floor(score);
        if (roundedScore === lastScoreRendered) {
            return;
        }

        lastScoreRendered = roundedScore;
        scoreElement.textContent = String(roundedScore).padStart(5, "0");
    }

    function drawBackground() {
        context.imageSmoothingEnabled = true;

        if (images.background) {
            const tileHeight = world.height;
            const tileWidth = tileHeight
                * images.background.naturalWidth
                / images.background.naturalHeight;
            const normalizedOffset = backgroundOffset % tileWidth;

            for (
                let x = -normalizedOffset;
                x < world.width;
                x += tileWidth
            ) {
                context.drawImage(images.background, x, 0, tileWidth, tileHeight);
            }
        } else {
            const gradient = context.createLinearGradient(0, 0, 0, world.height);
            gradient.addColorStop(0, config.palette.skyTop);
            gradient.addColorStop(1, config.palette.skyBottom);
            context.fillStyle = gradient;
            context.fillRect(0, 0, world.width, world.height);
        }

        context.fillStyle = config.background.tint;
        context.fillRect(0, 0, world.width, world.height);

        const groundShade = context.createLinearGradient(
            0,
            config.scene.groundY - 36,
            0,
            world.height
        );
        groundShade.addColorStop(0, "rgba(3, 7, 15, 0)");
        groundShade.addColorStop(1, config.background.groundShade);
        context.fillStyle = groundShade;
        context.fillRect(0, config.scene.groundY - 36, world.width, 61);

        context.strokeStyle = config.palette.ground;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(0, config.scene.groundY + 0.5);
        context.lineTo(world.width, config.scene.groundY + 0.5);
        context.stroke();
    }

    function drawRoundedImage(image, x, y, width, height, radius) {
        const right = x + width;
        const bottom = y + height;

        context.save();
        context.beginPath();
        context.moveTo(x + radius, y);
        context.lineTo(right - radius, y);
        context.quadraticCurveTo(right, y, right, y + radius);
        context.lineTo(right, bottom - radius);
        context.quadraticCurveTo(right, bottom, right - radius, bottom);
        context.lineTo(x + radius, bottom);
        context.quadraticCurveTo(x, bottom, x, bottom - radius);
        context.lineTo(x, y + radius);
        context.quadraticCurveTo(x, y, x + radius, y);
        context.closePath();
        context.clip();
        context.drawImage(image, x, y, width, height);
        context.restore();
    }

    function drawPlayer(timestamp) {
        context.fillStyle = config.palette.shadow;
        context.beginPath();
        const shadowScale = Math.max(
            0.35,
            1 - (playerGroundTop() - player.y) / 140
        );
        context.ellipse(
            config.player.x + config.player.drawWidth / 2,
            config.scene.groundY + 5,
            27 * shadowScale,
            6 * shadowScale,
            0,
            0,
            Math.PI * 2
        );
        context.fill();

        if (gameOver && images.death) {
            const deathX = config.player.x
                + (config.player.drawWidth - config.death.drawWidth) / 2;
            const deathY = config.scene.groundY
                - config.death.drawHeight
                + config.player.groundOverlap;
            drawRoundedImage(
                images.death,
                deathX,
                deathY,
                config.death.drawWidth,
                config.death.drawHeight,
                config.death.borderRadius
            );
            return;
        }

        if (images.player) {
            const frame = player.jumping
                ? config.player.jumpFrame
                : config.player.walkFrames[
                    Math.floor(timestamp / config.player.frameDurationMs)
                    % config.player.walkFrames.length
                ];

            context.imageSmoothingEnabled = true;
            context.drawImage(
                images.player,
                frame * config.player.frameWidth,
                config.player.frameY,
                config.player.frameWidth,
                config.player.frameHeight,
                config.player.x,
                player.y,
                config.player.drawWidth,
                config.player.drawHeight
            );
            return;
        }

        context.fillStyle = config.palette.fallbackPlayer;
        context.fillRect(
            config.player.x,
            player.y,
            config.player.drawWidth,
            config.player.drawHeight
        );
    }

    function drawObstacle(obstacle) {
        const image = images.obstacles.get(obstacle.variant.id);
        if (image) {
            context.imageSmoothingEnabled = true;
            context.drawImage(
                image,
                obstacle.x,
                obstacle.y,
                obstacle.width,
                obstacle.height
            );
            return;
        }

        context.fillStyle = config.palette.fallbackObstacle;
        context.fillRect(
            obstacle.x,
            obstacle.y,
            obstacle.width,
            obstacle.height
        );
    }

    function draw(timestamp) {
        context.clearRect(0, 0, world.width, world.height);
        drawBackground();
        obstacles.forEach(drawObstacle);
        drawPlayer(timestamp);
    }

    function animationLoop(timestamp) {
        if (!lastTimestamp) {
            lastTimestamp = timestamp;
        }

        const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.034);
        lastTimestamp = timestamp;

        if (assetsReady && !gameOver && !document.hidden) {
            update(deltaSeconds);
        }

        draw(timestamp);
        window.requestAnimationFrame(animationLoop);
    }

    function toggleMute() {
        muted = !muted;
        Object.values(sounds).forEach((audio) => {
            audio.muted = muted;
        });

        if (!muted) {
            startBgm();
        }

        muteButton.setAttribute("aria-pressed", String(muted));
        muteIcon.textContent = muted ? "×" : "♪";
        muteLabel.textContent = muted ? "声音关闭" : "声音开启";
    }

    function handleKeyboard(event) {
        if (event.code === "Space" || event.code === "ArrowUp") {
            event.preventDefault();
            jump();
            return;
        }

        if (event.code === "KeyR") {
            event.preventDefault();
            startBgm();
            resetGame();
        }
    }

    function bindControls() {
        window.addEventListener("keydown", handleKeyboard);
        canvas.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            canvas.focus({ preventScroll: true });
            jump();
        });
        jumpButton.addEventListener("click", jump);
        resetButton.addEventListener("click", () => {
            startBgm();
            resetGame();
        });
        stageAction.addEventListener("click", () => {
            startBgm();
            resetGame();
        });
        muteButton.addEventListener("click", toggleMute);
        document.addEventListener("visibilitychange", () => {
            lastTimestamp = 0;
        });
    }

    function localTestDeathScore() {
        const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
        if (!localHosts.has(window.location.hostname)) {
            return null;
        }

        const rawValue = new URLSearchParams(window.location.search)
            .get("testDeathScore");
        if (rawValue === null || rawValue.trim() === "") {
            return null;
        }

        const value = Number(rawValue);
        return Number.isInteger(value) && value >= 0 ? value : null;
    }

    async function start() {
        configureCanvas();
        configureAudio();
        bindControls();

        const obstacleImages = await Promise.all(
            config.obstacle.variants.map((variant) => loadImage(variant.image))
        );
        const [backgroundImage, playerImage] = await Promise.all([
            loadImage(config.background.image),
            loadImage(config.player.image)
        ]);

        images.background = backgroundImage;
        images.player = playerImage;
        config.obstacle.variants.forEach((variant, index) => {
            images.obstacles.set(variant.id, obstacleImages[index]);
        });

        specialEventText.textContent = config.specialScore.message;
        assetsReady = true;
        resetGame();
        startBgm();

        const forcedScore = localTestDeathScore();
        if (forcedScore !== null) {
            score = forcedScore;
            renderScore();
            finishGame();
        }
    }

    window.requestAnimationFrame(animationLoop);
    start();
})();
