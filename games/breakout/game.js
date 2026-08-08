(() =>
{
    "use strict";

    const config = window.BREAKOUT_CONFIG;
    if (!config)
    {
        throw new Error("BREAKOUT_CONFIG 未加载。");
    }

    const canvas = document.getElementById("game-canvas");
    const context = canvas.getContext("2d");
    const stage = document.querySelector(".stage");
    const stageMessage = document.getElementById("stage-message");
    const messageKicker = document.getElementById("message-kicker");
    const messageTitle = document.getElementById("message-title");
    const messageDetail = document.getElementById("message-detail");
    const stageAction = document.getElementById("stage-action");
    const scoreElement = document.getElementById("score");
    const levelElement = document.getElementById("level");
    const livesElement = document.getElementById("lives");
    const leftButton = document.getElementById("left-button");
    const rightButton = document.getElementById("right-button");
    const launchButton = document.getElementById("launch-button");
    const launchLabel = document.getElementById("launch-label");
    const muteButton = document.getElementById("mute-button");
    const muteIcon = document.getElementById("mute-icon");
    const muteLabel = document.getElementById("mute-label");
    const resetButton = document.getElementById("reset-button");

    const logicalWidth = config.canvas.width;
    const logicalHeight = config.canvas.height;
    const assetImages = {
        background: null,
        paddle: null,
        ball: null,
        portraits: null,
        bricks: {}
    };

    const paddle = {
        x: 0,
        y: logicalHeight - config.paddle.bottom - config.paddle.height,
        width: config.paddle.width,
        height: config.paddle.height
    };

    const ball = {
        x: 0,
        y: 0,
        dx: 0,
        dy: 0,
        radius: config.ball.radius,
        rotation: 0
    };

    const state = {
        mode: "loading",
        score: 0,
        lives: config.game.startingLives,
        levelIndex: 0,
        bricks: [],
        particles: [],
        keys: { left: false, right: false },
        pointerActive: false,
        muted: false,
        lastTime: 0,
        levelTimer: null
    };

    const decorativeStars = Array.from({ length: 42 }, (_, index) => ({
        x: ((index * 97) % 787) + 7,
        y: ((index * 53) % 472) + 9,
        radius: 0.6 + (index % 4) * 0.34,
        alpha: 0.14 + (index % 5) * 0.055
    }));

    class AudioController
    {
        constructor(audioConfig)
        {
            this.config = audioConfig;
            this.files = new Map();
            this.context = null;
            this.bgm = null;
            this.createFileAudio();
        }

        createFileAudio()
        {
            for (const [name, path] of Object.entries(this.config))
            {
                if (typeof path !== "string" || !path)
                {
                    continue;
                }

                const audio = new Audio(path);
                audio.preload = name === "bgm" ? "metadata" : "auto";
                audio.volume = name === "bgm"
                    ? this.config.bgmVolume
                    : this.config.volume;

                if (name === "bgm")
                {
                    audio.loop = true;
                    this.bgm = audio;
                }
                else
                {
                    this.files.set(name, audio);
                }
            }
        }

        unlock()
        {
            if (!this.context)
            {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (AudioContextClass)
                {
                    this.context = new AudioContextClass();
                }
            }

            if (this.context?.state === "suspended")
            {
                this.context.resume().catch(() => {});
            }
        }

        setMuted(muted)
        {
            if (this.bgm)
            {
                this.bgm.muted = muted;
                if (muted)
                {
                    this.bgm.pause();
                }
            }

            for (const audio of this.files.values())
            {
                audio.muted = muted;
            }
        }

        startBgm()
        {
            if (!this.bgm || state.muted)
            {
                return;
            }

            this.bgm.play().catch(() => {});
        }

        pauseBgm()
        {
            this.bgm?.pause();
        }

        play(name)
        {
            if (state.muted)
            {
                return;
            }

            this.unlock();
            const audio = this.files.get(name);
            if (audio)
            {
                audio.currentTime = 0;
                audio.play().catch(() => {});
                return;
            }

            this.playTone(name);
        }

        playTone(name)
        {
            if (!this.context)
            {
                return;
            }

            const toneMap = {
                launch: [410, 0.07],
                wall: [235, 0.035],
                paddle: [320, 0.055],
                brick: [610, 0.045],
                lose: [130, 0.18],
                clear: [760, 0.24],
                gameOver: [92, 0.32]
            };
            const [frequency, duration] = toneMap[name] || [280, 0.05];
            const oscillator = this.context.createOscillator();
            const gain = this.context.createGain();
            const now = this.context.currentTime;

            oscillator.type = name === "lose" || name === "gameOver" ? "sawtooth" : "sine";
            oscillator.frequency.setValueAtTime(frequency, now);
            if (name === "clear")
            {
                oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.5, now + duration);
            }
            else if (name === "lose" || name === "gameOver")
            {
                oscillator.frequency.exponentialRampToValueAtTime(Math.max(50, frequency * 0.55), now + duration);
            }

            gain.gain.setValueAtTime(Math.max(0.0001, this.config.volume * 0.11), now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
            oscillator.connect(gain);
            gain.connect(this.context.destination);
            oscillator.start(now);
            oscillator.stop(now + duration);
        }
    }

    const audioController = new AudioController(config.audio);

    function loadImage(path)
    {
        return new Promise((resolve) =>
        {
            if (!path)
            {
                resolve(null);
                return;
            }

            const image = new Image();
            image.decoding = "async";
            image.onload = () => resolve(image);
            image.onerror = () =>
            {
                console.warn(`可选图片加载失败，已使用程序绘制替代：${path}`);
                resolve(null);
            };
            image.src = path;
        });
    }

    async function loadAssets()
    {
        const tasks = [
            loadImage(config.scene.backgroundImage).then((image) => { assetImages.background = image; }),
            loadImage(config.paddle.image).then((image) => { assetImages.paddle = image; }),
            loadImage(config.ball.image).then((image) => { assetImages.ball = image; }),
            loadImage(config.bricks.portraits?.image).then((image) => { assetImages.portraits = image; })
        ];

        for (const [type, definition] of Object.entries(config.bricks.types))
        {
            tasks.push(loadImage(definition.image).then((image) =>
            {
                assetImages.bricks[type] = image;
            }));
        }

        await Promise.all(tasks);
    }

    function resizeCanvas()
    {
        const ratio = Math.min(window.devicePixelRatio || 1, config.canvas.maxDevicePixelRatio);
        canvas.width = Math.round(logicalWidth * ratio);
        canvas.height = Math.round(logicalHeight * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function roundedRectPath(x, y, width, height, radius)
    {
        const safeRadius = Math.min(radius, width / 2, height / 2);
        context.beginPath();
        context.roundRect(x, y, width, height, safeRadius);
    }

    function drawImageCover(image, x, y, width, height)
    {
        const imageRatio = image.naturalWidth / image.naturalHeight;
        const targetRatio = width / height;
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = image.naturalWidth;
        let sourceHeight = image.naturalHeight;

        if (imageRatio > targetRatio)
        {
            sourceWidth = image.naturalHeight * targetRatio;
            sourceX = (image.naturalWidth - sourceWidth) / 2;
        }
        else
        {
            sourceHeight = image.naturalWidth / targetRatio;
            sourceY = (image.naturalHeight - sourceHeight) / 2;
        }

        context.drawImage(
            image,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            x,
            y,
            width,
            height
        );
    }

    function drawBackground()
    {
        if (assetImages.background)
        {
            drawImageCover(assetImages.background, 0, 0, logicalWidth, logicalHeight);
            context.fillStyle = "rgba(7, 9, 19, 0.24)";
            context.fillRect(0, 0, logicalWidth, logicalHeight);
        }
        else
        {
            const gradient = context.createLinearGradient(0, 0, 0, logicalHeight);
            gradient.addColorStop(0, config.scene.backgroundTop);
            gradient.addColorStop(1, config.scene.backgroundBottom);
            context.fillStyle = gradient;
            context.fillRect(0, 0, logicalWidth, logicalHeight);

            context.strokeStyle = config.scene.gridColor;
            context.lineWidth = 1;
            for (let x = 0; x <= logicalWidth; x += 40)
            {
                context.beginPath();
                context.moveTo(x, 0);
                context.lineTo(x, logicalHeight);
                context.stroke();
            }
            for (let y = 0; y <= logicalHeight; y += 40)
            {
                context.beginPath();
                context.moveTo(0, y);
                context.lineTo(logicalWidth, y);
                context.stroke();
            }
        }

        for (const star of decorativeStars)
        {
            context.globalAlpha = star.alpha;
            context.fillStyle = "#f7eaff";
            context.beginPath();
            context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            context.fill();
        }
        context.globalAlpha = 1;

        const topGlow = context.createLinearGradient(0, 0, 0, 76);
        topGlow.addColorStop(0, config.scene.wallGlow);
        topGlow.addColorStop(1, "rgba(142, 124, 255, 0)");
        context.fillStyle = topGlow;
        context.fillRect(0, 0, logicalWidth, 76);
    }

    function drawBrick(brick)
    {
        const definition = config.bricks.types[brick.type];
        const image = assetImages.bricks[brick.type];
        context.save();
        roundedRectPath(brick.x, brick.y, brick.width, brick.height, config.bricks.cornerRadius);
        context.clip();

        if (image)
        {
            drawImageCover(image, brick.x, brick.y, brick.width, brick.height);
            context.fillStyle = "rgba(15, 11, 27, 0.13)";
            context.fillRect(brick.x, brick.y, brick.width, brick.height);
        }
        else
        {
            const gradient = context.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.height);
            gradient.addColorStop(0, definition.colorA);
            gradient.addColorStop(1, definition.colorB);
            context.fillStyle = gradient;
            context.fillRect(brick.x, brick.y, brick.width, brick.height);
        }

        const shine = context.createLinearGradient(0, brick.y, 0, brick.y + brick.height);
        shine.addColorStop(0, "rgba(255, 255, 255, 0.38)");
        shine.addColorStop(0.38, "rgba(255, 255, 255, 0.04)");
        shine.addColorStop(1, "rgba(0, 0, 0, 0.14)");
        context.fillStyle = shine;
        context.fillRect(brick.x, brick.y, brick.width, brick.height);

        const portraitSettings = config.bricks.portraits;
        const portraitCrop = portraitSettings?.crops?.[definition.portraitIndex];
        if (assetImages.portraits && portraitCrop)
        {
            const scale = Math.min(
                portraitSettings.maximumWidth / portraitCrop.width,
                portraitSettings.maximumHeight / portraitCrop.height
            );
            const portraitWidth = portraitCrop.width * scale;
            const portraitHeight = portraitCrop.height * scale;
            const portraitX = brick.x + (brick.width - portraitWidth) / 2;
            const portraitY = brick.y + (brick.height - portraitHeight) / 2;

            context.save();
            context.globalAlpha = portraitSettings.opacity;
            context.shadowColor = "rgba(255, 255, 255, 0.72)";
            context.shadowBlur = 7;
            context.drawImage(
                assetImages.portraits,
                portraitCrop.x,
                portraitCrop.y,
                portraitCrop.width,
                portraitCrop.height,
                portraitX,
                portraitY,
                portraitWidth,
                portraitHeight
            );
            context.restore();
        }

        if (brick.hitPoints < brick.maximumHitPoints)
        {
            context.strokeStyle = "rgba(255, 248, 227, 0.78)";
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(brick.x + brick.width * 0.28, brick.y + 2);
            context.lineTo(brick.x + brick.width * 0.48, brick.y + brick.height * 0.48);
            context.lineTo(brick.x + brick.width * 0.38, brick.y + brick.height - 2);
            context.stroke();
        }
        context.restore();

        context.strokeStyle = "rgba(255, 255, 255, 0.2)";
        context.lineWidth = 1;
        roundedRectPath(brick.x + 0.5, brick.y + 0.5, brick.width - 1, brick.height - 1, config.bricks.cornerRadius);
        context.stroke();
    }

    function drawPaddle()
    {
        if (assetImages.paddle)
        {
            const drawWidth = config.paddle.drawWidth || paddle.width;
            const drawHeight = config.paddle.drawHeight || paddle.height;
            const drawX = paddle.x + (paddle.width - drawWidth) / 2;
            const drawY = paddle.y + paddle.height - drawHeight + (config.paddle.drawOffsetY || 0);
            context.save();
            context.shadowColor = "rgba(255, 111, 181, 0.46)";
            context.shadowBlur = 18;
            context.drawImage(assetImages.paddle, drawX, drawY, drawWidth, drawHeight);
            context.restore();
            return;
        }

        context.save();
        context.shadowColor = "rgba(255, 111, 181, 0.52)";
        context.shadowBlur = 18;
        roundedRectPath(paddle.x, paddle.y, paddle.width, paddle.height, paddle.height / 2);
        context.clip();
        const gradient = context.createLinearGradient(paddle.x, 0, paddle.x + paddle.width, 0);
        gradient.addColorStop(0, config.scene.paddleColorA);
        gradient.addColorStop(1, config.scene.paddleColorB);
        context.fillStyle = gradient;
        context.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
        context.restore();

        context.fillStyle = "rgba(255, 255, 255, 0.42)";
        roundedRectPath(paddle.x + 12, paddle.y + 3, Math.max(18, paddle.width - 24), 3, 2);
        context.fill();
    }

    function drawBall()
    {
        if (assetImages.ball)
        {
            const crop = config.ball.sourceCrop;
            const drawWidth = config.ball.drawWidth || ball.radius * 2;
            const drawHeight = config.ball.drawHeight || ball.radius * 2;
            context.save();
            context.translate(ball.x, ball.y);
            context.rotate(ball.rotation);
            context.shadowColor = "rgba(255, 205, 133, 0.78)";
            context.shadowBlur = 14;
            if (crop)
            {
                context.drawImage(
                    assetImages.ball,
                    crop.x,
                    crop.y,
                    crop.width,
                    crop.height,
                    -drawWidth / 2,
                    -drawHeight / 2,
                    drawWidth,
                    drawHeight
                );
            }
            else
            {
                context.drawImage(assetImages.ball, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
            }
            context.restore();
            return;
        }

        context.save();
        context.shadowColor = "rgba(255, 234, 248, 0.8)";
        context.shadowBlur = 16;
        context.beginPath();
        context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        context.clip();

        const gradient = context.createRadialGradient(
            ball.x - ball.radius * 0.35,
            ball.y - ball.radius * 0.4,
            1,
            ball.x,
            ball.y,
            ball.radius
        );
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.42, config.scene.ballColor);
        gradient.addColorStop(1, "#c59ee9");
        context.fillStyle = gradient;
        context.fillRect(
            ball.x - ball.radius,
            ball.y - ball.radius,
            ball.radius * 2,
            ball.radius * 2
        );
        context.restore();
    }

    function drawParticles()
    {
        for (const particle of state.particles)
        {
            context.globalAlpha = Math.max(0, particle.life / particle.maximumLife);
            context.fillStyle = particle.color;
            context.beginPath();
            context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            context.fill();
        }
        context.globalAlpha = 1;
    }

    function render()
    {
        context.clearRect(0, 0, logicalWidth, logicalHeight);
        drawBackground();
        state.bricks.forEach(drawBrick);
        drawParticles();
        drawPaddle();
        drawBall();
    }

    function createLevel(index)
    {
        const rows = config.levels[index];
        const columns = config.bricks.columns;
        const width = (
            logicalWidth
            - config.bricks.sideMargin * 2
            - config.bricks.gap * (columns - 1)
        ) / columns;
        const bricks = [];

        rows.forEach((row, rowIndex) =>
        {
            Array.from(row).slice(0, columns).forEach((type, columnIndex) =>
            {
                const definition = config.bricks.types[type];
                if (!definition)
                {
                    return;
                }

                bricks.push({
                    type,
                    x: config.bricks.sideMargin + columnIndex * (width + config.bricks.gap),
                    y: config.bricks.top + rowIndex * (config.bricks.height + config.bricks.rowGap),
                    width,
                    height: config.bricks.height,
                    hitPoints: definition.hitPoints,
                    maximumHitPoints: definition.hitPoints
                });
            });
        });

        return bricks;
    }

    function resetPaddleAndBall()
    {
        paddle.x = (logicalWidth - paddle.width) / 2;
        paddle.y = logicalHeight - config.paddle.bottom - paddle.height;
        ball.x = paddle.x + paddle.width / 2;
        ball.y = paddle.y - ball.radius - 4;
        ball.dx = 0;
        ball.dy = 0;
        ball.rotation = 0;
    }

    function loadLevel(index)
    {
        state.levelIndex = index;
        state.bricks = createLevel(index);
        state.particles = [];
        state.mode = "ready";
        resetPaddleAndBall();
        updateStatus();
        setMessage(
            `LEVEL ${String(index + 1).padStart(2, "0")}`,
            index === 0 ? "准备好了吗？" : `第 ${index + 1} 关`,
            "按空格或点击画面发球",
            "开始打饺"
        );
        updateLaunchLabel();
    }

    function updateStatus()
    {
        scoreElement.textContent = String(state.score).padStart(config.game.scoreDigits, "0");
        levelElement.textContent = String(state.levelIndex + 1).padStart(2, "0");
        const fullLives = Array.from({ length: state.lives }, () => "♥");
        const emptyLives = Array.from(
            { length: Math.max(0, config.game.startingLives - state.lives) },
            () => "♡"
        );
        livesElement.textContent = [...fullLives, ...emptyLives].join(" ");
        livesElement.setAttribute("aria-label", `剩余${state.lives}次机会`);
    }

    function setMessage(kicker, title, detail, actionLabel)
    {
        messageKicker.textContent = kicker;
        messageTitle.textContent = title;
        messageDetail.textContent = detail;
        stageAction.textContent = actionLabel;
        stageMessage.hidden = false;
    }

    function hideMessage()
    {
        stageMessage.hidden = true;
    }

    function updateLaunchLabel()
    {
        const labelMap = {
            ready: "发球",
            running: "暂停",
            paused: "继续",
            cleared: "下一关",
            won: "再玩一次",
            gameover: "重新开始"
        };
        launchLabel.textContent = labelMap[state.mode] || "发球";
    }

    function startBackgroundMusic()
    {
        audioController.unlock();
        audioController.startBgm();
    }

    function launchBall()
    {
        if (state.mode !== "ready")
        {
            return;
        }

        const speed = config.ball.startingSpeed + state.levelIndex * 18;
        const horizontalDirection = (state.score + state.lives + state.levelIndex) % 2 === 0 ? 1 : -1;
        const horizontalSpeed = Math.min(speed * 0.36, 132) * horizontalDirection;
        ball.dx = horizontalSpeed;
        ball.dy = -Math.sqrt(Math.max(1, speed * speed - horizontalSpeed * horizontalSpeed));
        state.mode = "running";
        hideMessage();
        updateLaunchLabel();
        audioController.play("launch");
        startBackgroundMusic();
    }

    function pauseGame(showMessage = true)
    {
        if (state.mode !== "running")
        {
            return;
        }

        state.mode = "paused";
        if (showMessage)
        {
            setMessage("PAUSED", "游戏暂停", "按 P、空格或点击继续", "继续游戏");
        }
        audioController.pauseBgm();
        updateLaunchLabel();
    }

    function resumeGame()
    {
        if (state.mode !== "paused")
        {
            return;
        }

        state.mode = "running";
        hideMessage();
        startBackgroundMusic();
        updateLaunchLabel();
    }

    function advanceLevel()
    {
        if (state.mode !== "cleared")
        {
            return;
        }

        if (state.levelTimer)
        {
            window.clearTimeout(state.levelTimer);
            state.levelTimer = null;
        }

        const nextIndex = state.levelIndex + 1;
        if (nextIndex >= config.levels.length)
        {
            state.mode = "won";
            audioController.pauseBgm();
            setMessage("ALL CLEAR", "全部通关！", `最终得分 ${state.score}`, "再玩一次");
            updateLaunchLabel();
            window.CialloLeaderboard?.reportScore(state.score);
            return;
        }

        loadLevel(nextIndex);
    }

    function clearLevel()
    {
        if (state.mode !== "running")
        {
            return;
        }

        state.mode = "cleared";
        ball.dx = 0;
        ball.dy = 0;
        audioController.play("clear");
        setMessage(
            "LEVEL CLEAR",
            "砖块清空！",
            state.levelIndex + 1 < config.levels.length
                ? `即将进入第 ${state.levelIndex + 2} 关`
                : "最后一关完成",
            state.levelIndex + 1 < config.levels.length ? "下一关" : "查看结果"
        );
        updateLaunchLabel();
        state.levelTimer = window.setTimeout(advanceLevel, config.game.nextLevelDelayMs);
    }

    function loseBall()
    {
        state.lives -= 1;
        updateStatus();
        audioController.play(state.lives > 0 ? "lose" : "gameOver");

        if (state.lives <= 0)
        {
            state.mode = "gameover";
            ball.dx = 0;
            ball.dy = 0;
            audioController.pauseBgm();
            setMessage("GAME OVER", "机会用完了", `本局得分 ${state.score}`, "重新开始");
            updateLaunchLabel();
            window.CialloLeaderboard?.reportScore(state.score);
            return;
        }

        state.mode = "ready";
        resetPaddleAndBall();
        setMessage("MISS", "再来一次", `还剩 ${state.lives} 次机会`, "继续游戏");
        updateLaunchLabel();
    }

    function restartGame()
    {
        if (state.levelTimer)
        {
            window.clearTimeout(state.levelTimer);
            state.levelTimer = null;
        }

        state.score = 0;
        state.lives = config.game.startingLives;
        audioController.pauseBgm();
        loadLevel(0);
    }

    function activateMainAction()
    {
        audioController.unlock();

        if (state.mode === "ready")
        {
            launchBall();
        }
        else if (state.mode === "running")
        {
            pauseGame();
        }
        else if (state.mode === "paused")
        {
            resumeGame();
        }
        else if (state.mode === "cleared")
        {
            advanceLevel();
        }
        else if (state.mode === "won" || state.mode === "gameover")
        {
            restartGame();
        }
    }

    function clampPaddle()
    {
        paddle.x = Math.max(0, Math.min(logicalWidth - paddle.width, paddle.x));
        if (state.mode === "ready")
        {
            ball.x = paddle.x + paddle.width / 2;
            ball.y = paddle.y - ball.radius - 4;
        }
    }

    function setPaddleFromClientX(clientX)
    {
        const bounds = canvas.getBoundingClientRect();
        if (!bounds.width)
        {
            return;
        }
        const logicalX = (clientX - bounds.left) / bounds.width * logicalWidth;
        paddle.x = logicalX - paddle.width / 2;
        clampPaddle();
    }

    function circleIntersectsRectangle(targetBall, rectangle)
    {
        const nearestX = Math.max(rectangle.x, Math.min(targetBall.x, rectangle.x + rectangle.width));
        const nearestY = Math.max(rectangle.y, Math.min(targetBall.y, rectangle.y + rectangle.height));
        const dx = targetBall.x - nearestX;
        const dy = targetBall.y - nearestY;
        return dx * dx + dy * dy <= targetBall.radius * targetBall.radius;
    }

    function normalizeBallSpeed(speed)
    {
        const currentSpeed = Math.hypot(ball.dx, ball.dy) || 1;
        const scale = speed / currentSpeed;
        ball.dx *= scale;
        ball.dy *= scale;
    }

    function createBrickParticles(brick)
    {
        const definition = config.bricks.types[brick.type];
        for (let index = 0; index < 7; index += 1)
        {
            const life = 0.32 + (index % 3) * 0.07;
            state.particles.push({
                x: ball.x,
                y: ball.y,
                dx: ((index * 71) % 150) - 75,
                dy: -30 - ((index * 43) % 95),
                radius: 1.8 + (index % 3) * 0.65,
                color: index % 2 === 0 ? definition.colorA : definition.colorB,
                life,
                maximumLife: life
            });
        }
    }

    function reflectFromBrick(brick, previousX, previousY)
    {
        const wasAbove = previousY + ball.radius <= brick.y;
        const wasBelow = previousY - ball.radius >= brick.y + brick.height;
        const wasLeft = previousX + ball.radius <= brick.x;
        const wasRight = previousX - ball.radius >= brick.x + brick.width;

        if (wasAbove)
        {
            ball.y = brick.y - ball.radius;
            ball.dy = -Math.abs(ball.dy);
        }
        else if (wasBelow)
        {
            ball.y = brick.y + brick.height + ball.radius;
            ball.dy = Math.abs(ball.dy);
        }
        else if (wasLeft)
        {
            ball.x = brick.x - ball.radius;
            ball.dx = -Math.abs(ball.dx);
        }
        else if (wasRight)
        {
            ball.x = brick.x + brick.width + ball.radius;
            ball.dx = Math.abs(ball.dx);
        }
        else
        {
            ball.dy *= -1;
        }
    }

    function hitBrick(brick, index, previousX, previousY)
    {
        reflectFromBrick(brick, previousX, previousY);
        brick.hitPoints -= 1;
        const definition = config.bricks.types[brick.type];
        state.score += definition.score;
        updateStatus();
        createBrickParticles(brick);
        audioController.play("brick");

        if (brick.hitPoints <= 0)
        {
            state.bricks.splice(index, 1);
        }

        const nextSpeed = Math.min(
            config.ball.maximumSpeed,
            Math.hypot(ball.dx, ball.dy) * config.ball.speedGainPerBrick
        );
        normalizeBallSpeed(nextSpeed);

        if (state.bricks.length === 0)
        {
            clearLevel();
        }
    }

    function moveBall(deltaTime)
    {
        const speed = Math.hypot(ball.dx, ball.dy);
        const stepDistance = Math.max(3, ball.radius * 0.7);
        const steps = Math.max(1, Math.ceil(speed * deltaTime / stepDistance));
        const stepTime = deltaTime / steps;

        for (let step = 0; step < steps; step += 1)
        {
            if (state.mode !== "running")
            {
                return;
            }

            const previousX = ball.x;
            const previousY = ball.y;
            ball.x += ball.dx * stepTime;
            ball.y += ball.dy * stepTime;

            if (ball.x - ball.radius < 0)
            {
                ball.x = ball.radius;
                ball.dx = Math.abs(ball.dx);
                audioController.play("wall");
            }
            else if (ball.x + ball.radius > logicalWidth)
            {
                ball.x = logicalWidth - ball.radius;
                ball.dx = -Math.abs(ball.dx);
                audioController.play("wall");
            }

            if (ball.y - ball.radius < 0)
            {
                ball.y = ball.radius;
                ball.dy = Math.abs(ball.dy);
                audioController.play("wall");
            }

            if (ball.dy > 0 && circleIntersectsRectangle(ball, paddle))
            {
                ball.y = paddle.y - ball.radius;
                const hitPosition = Math.max(
                    -1,
                    Math.min(1, (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2))
                );
                const maximumAngle = Math.PI * 0.36;
                const angle = hitPosition * maximumAngle;
                const currentSpeed = Math.max(config.ball.startingSpeed, Math.hypot(ball.dx, ball.dy));
                ball.dx = currentSpeed * Math.sin(angle);
                ball.dy = -Math.abs(currentSpeed * Math.cos(angle));
                audioController.play("paddle");
            }

            for (let index = 0; index < state.bricks.length; index += 1)
            {
                const brick = state.bricks[index];
                if (circleIntersectsRectangle(ball, brick))
                {
                    hitBrick(brick, index, previousX, previousY);
                    break;
                }
            }

            if (ball.y - ball.radius > logicalHeight)
            {
                loseBall();
                return;
            }
        }
    }

    function updateParticles(deltaTime)
    {
        for (const particle of state.particles)
        {
            particle.x += particle.dx * deltaTime;
            particle.y += particle.dy * deltaTime;
            particle.dy += 220 * deltaTime;
            particle.life -= deltaTime;
        }
        state.particles = state.particles.filter((particle) => particle.life > 0);
    }

    function update(deltaTime)
    {
        const direction = (state.keys.right ? 1 : 0) - (state.keys.left ? 1 : 0);
        if (direction !== 0)
        {
            paddle.x += direction * config.paddle.speed * deltaTime;
            clampPaddle();
        }

        if (state.mode === "ready")
        {
            ball.x = paddle.x + paddle.width / 2;
            ball.y = paddle.y - ball.radius - 4;
        }
        else if (state.mode === "running")
        {
            ball.rotation = (ball.rotation + config.ball.rotationSpeed * deltaTime) % (Math.PI * 2);
            moveBall(deltaTime);
        }

        updateParticles(deltaTime);
    }

    function gameLoop(timestamp)
    {
        const deltaTime = state.lastTime
            ? Math.min(0.025, (timestamp - state.lastTime) / 1000)
            : 0;
        state.lastTime = timestamp;
        update(deltaTime);
        render();
        window.requestAnimationFrame(gameLoop);
    }

    function setDirectionButton(button, direction, pressed)
    {
        state.keys[direction] = pressed;
        button.classList.toggle("is-pressed", pressed);
    }

    function bindDirectionButton(button, direction)
    {
        button.addEventListener("pointerdown", (event) =>
        {
            event.preventDefault();
            setDirectionButton(button, direction, true);
            button.setPointerCapture?.(event.pointerId);
        });

        const release = () => setDirectionButton(button, direction, false);
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("lostpointercapture", release);
    }

    function toggleMute()
    {
        state.muted = !state.muted;
        audioController.setMuted(state.muted);
        muteButton.setAttribute("aria-pressed", String(state.muted));
        muteIcon.textContent = state.muted ? "×" : "♪";
        muteLabel.textContent = state.muted ? "声音关闭" : "声音开启";

        if (!state.muted && state.mode === "running")
        {
            startBackgroundMusic();
        }
    }

    document.addEventListener("keydown", (event) =>
    {
        if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code))
        {
            event.preventDefault();
        }

        if (event.code === "ArrowLeft" || event.code === "KeyA")
        {
            setDirectionButton(leftButton, "left", true);
        }
        else if (event.code === "ArrowRight" || event.code === "KeyD")
        {
            setDirectionButton(rightButton, "right", true);
        }

        if (event.repeat)
        {
            return;
        }

        if (event.code === "Space")
        {
            activateMainAction();
        }
        else if (event.code === "KeyP")
        {
            state.mode === "running" ? pauseGame() : resumeGame();
        }
        else if (event.code === "KeyR")
        {
            restartGame();
        }
        else if (event.code === "KeyM")
        {
            toggleMute();
        }
    });

    document.addEventListener("keyup", (event) =>
    {
        if (event.code === "ArrowLeft" || event.code === "KeyA")
        {
            setDirectionButton(leftButton, "left", false);
        }
        else if (event.code === "ArrowRight" || event.code === "KeyD")
        {
            setDirectionButton(rightButton, "right", false);
        }
    });

    stage.addEventListener("pointermove", (event) =>
    {
        if (event.pointerType === "mouse" || state.pointerActive)
        {
            setPaddleFromClientX(event.clientX);
        }
    });

    stage.addEventListener("pointerdown", (event) =>
    {
        if (event.target === stageAction)
        {
            return;
        }

        state.pointerActive = true;
        setPaddleFromClientX(event.clientX);
        canvas.focus({ preventScroll: true });
        if (state.mode === "ready" || state.mode === "paused")
        {
            activateMainAction();
        }
    });

    window.addEventListener("pointerup", () =>
    {
        state.pointerActive = false;
    });

    window.addEventListener("blur", () =>
    {
        setDirectionButton(leftButton, "left", false);
        setDirectionButton(rightButton, "right", false);
        pauseGame();
    });

    document.addEventListener("visibilitychange", () =>
    {
        if (document.hidden)
        {
            pauseGame();
        }
    });

    bindDirectionButton(leftButton, "left");
    bindDirectionButton(rightButton, "right");
    launchButton.addEventListener("click", activateMainAction);
    stageAction.addEventListener("click", activateMainAction);
    muteButton.addEventListener("click", toggleMute);
    resetButton.addEventListener("click", restartGame);
    window.addEventListener("resize", resizeCanvas);

    resizeCanvas();
    updateStatus();
    setMessage("LOADING", "正在准备游戏", "本地素材加载中…", "请稍候");

    loadAssets()
        .catch((error) => console.error("素材初始化失败：", error))
        .finally(() =>
        {
            loadLevel(0);
            window.requestAnimationFrame(gameLoop);
        });
})();
