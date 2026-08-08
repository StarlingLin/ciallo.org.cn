(() => {
    "use strict";

    const config = window.ASTEROIDS_CONFIG;
    if (!config)
    {
        throw new Error("缺少 ASTEROIDS_CONFIG");
    }

    const canvas = document.getElementById("game-canvas");
    const context = canvas.getContext("2d");
    const scoreElement = document.getElementById("score");
    const waveElement = document.getElementById("wave");
    const livesElement = document.getElementById("lives");
    const stageMessage = document.getElementById("stage-message");
    const messageKicker = document.getElementById("message-kicker");
    const messageTitle = document.getElementById("message-title");
    const messageDetail = document.getElementById("message-detail");
    const stageAction = document.getElementById("stage-action");
    const pauseButton = document.getElementById("pause-button");
    const pauseLabel = document.getElementById("pause-label");
    const muteButton = document.getElementById("mute-button");
    const muteIcon = document.getElementById("mute-icon");
    const muteLabel = document.getElementById("mute-label");

    const logicalWidth = config.canvas.width;
    const logicalHeight = config.canvas.height;
    const keys = { left: false, right: false, thrust: false, fire: false };
    const bullets = [];
    const asteroids = [];
    const particles = [];
    const stars = [];

    const state = {
        mode: "ready",
        score: 0,
        wave: 1,
        lives: config.game.startingLives,
        lastTimestamp: 0,
        elapsed: 0,
        lastShotAt: -Infinity
    };

    const ship = {
        x: logicalWidth / 2,
        y: logicalHeight / 2,
        dx: 0,
        dy: 0,
        angle: -Math.PI / 2,
        invulnerableUntil: 0
    };

    function clamp(value, minimum, maximum)
    {
        return Math.max(minimum, Math.min(maximum, value));
    }

    function randomBetween(minimum, maximum)
    {
        return minimum + Math.random() * (maximum - minimum);
    }

    function loadImage(path)
    {
        if (!path)
        {
            return null;
        }

        const image = new Image();
        image.decoding = "async";
        image.src = path;
        return image;
    }

    const assetImages = {
        background: loadImage(config.scene.backgroundImage),
        ship: loadImage(config.ship.image),
        bullet: loadImage(config.bullet.image),
        asteroids: config.asteroids.images.map(loadImage)
    };

    class AudioController
    {
        constructor(settings)
        {
            this.settings = settings;
            this.muted = false;
            this.context = null;
            this.bgm = settings.bgm ? new Audio(settings.bgm) : null;
            this.sounds = {};

            for (const name of ["shoot", "hit", "explode", "lose", "wave"])
            {
                if (settings[name])
                {
                    const audio = new Audio(settings[name]);
                    audio.preload = "metadata";
                    this.sounds[name] = audio;
                }
            }

            if (this.bgm)
            {
                this.bgm.loop = true;
                this.bgm.preload = "metadata";
                this.bgm.volume = settings.bgmVolume;
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

            if (this.bgm && !this.muted && this.bgm.paused)
            {
                this.bgm.play().catch(() => {});
            }
        }

        toggleMute()
        {
            this.muted = !this.muted;
            if (this.bgm)
            {
                this.bgm.muted = this.muted;
                if (!this.muted)
                {
                    this.unlock();
                }
            }
            return this.muted;
        }

        play(name)
        {
            if (this.muted)
            {
                return;
            }

            this.unlock();
            const source = this.sounds[name];
            if (source)
            {
                const instance = source.cloneNode();
                instance.volume = this.settings.volume;
                instance.play().catch(() => {});
                return;
            }

            this.playGenerated(name);
        }

        playGenerated(name)
        {
            if (!this.context)
            {
                return;
            }

            const now = this.context.currentTime;
            if (name === "explode" || name === "lose")
            {
                const duration = name === "lose" ? 0.42 : 0.2;
                const sampleCount = Math.ceil(this.context.sampleRate * duration);
                const buffer = this.context.createBuffer(1, sampleCount, this.context.sampleRate);
                const data = buffer.getChannelData(0);
                for (let index = 0; index < sampleCount; index += 1)
                {
                    data[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
                }
                const noise = this.context.createBufferSource();
                const filter = this.context.createBiquadFilter();
                const gain = this.context.createGain();
                noise.buffer = buffer;
                filter.type = "lowpass";
                filter.frequency.setValueAtTime(name === "lose" ? 520 : 920, now);
                gain.gain.setValueAtTime(0.12 * this.settings.volume, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
                noise.connect(filter).connect(gain).connect(this.context.destination);
                noise.start(now);
                return;
            }

            const oscillator = this.context.createOscillator();
            const gain = this.context.createGain();
            const tones = {
                shoot: [760, 310, 0.075, "square"],
                hit: [260, 150, 0.055, "triangle"],
                wave: [420, 860, 0.22, "sine"]
            };
            const [startFrequency, endFrequency, duration, type] = tones[name] || tones.hit;
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(startFrequency, now);
            oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
            gain.gain.setValueAtTime(0.09 * this.settings.volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            oscillator.connect(gain).connect(this.context.destination);
            oscillator.start(now);
            oscillator.stop(now + duration);
        }
    }

    const audioController = new AudioController(config.audio);

    function resizeCanvas()
    {
        const ratio = Math.min(window.devicePixelRatio || 1, config.canvas.maxDevicePixelRatio);
        canvas.width = Math.round(logicalWidth * ratio);
        canvas.height = Math.round(logicalHeight * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function createStars()
    {
        stars.length = 0;
        for (let index = 0; index < 110; index += 1)
        {
            stars.push({
                x: Math.random() * logicalWidth,
                y: Math.random() * logicalHeight,
                radius: randomBetween(0.35, 1.45),
                alpha: randomBetween(0.24, 0.86),
                twinkle: randomBetween(0.8, 2.4),
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    function wrap(entity, radius)
    {
        if (entity.x < -radius) entity.x = logicalWidth + radius;
        if (entity.x > logicalWidth + radius) entity.x = -radius;
        if (entity.y < -radius) entity.y = logicalHeight + radius;
        if (entity.y > logicalHeight + radius) entity.y = -radius;
    }

    function resetShip()
    {
        ship.x = logicalWidth / 2;
        ship.y = logicalHeight / 2;
        ship.dx = 0;
        ship.dy = 0;
        ship.angle = -Math.PI / 2;
        ship.invulnerableUntil = performance.now() + config.ship.invulnerabilityMs;
    }

    function createAsteroid(sizeName, x, y, velocityAngle = null)
    {
        const settings = config.asteroids.sizes[sizeName];
        const angle = velocityAngle ?? Math.random() * Math.PI * 2;
        const speed = randomBetween(settings.speedMin, settings.speedMax);
        const shape = [];
        const points = 10;
        for (let index = 0; index < points; index += 1)
        {
            shape.push(randomBetween(0.72, 1.08));
        }

        asteroids.push({
            sizeName,
            x,
            y,
            dx: Math.cos(angle) * speed,
            dy: Math.sin(angle) * speed,
            angle: Math.random() * Math.PI * 2,
            rotationSpeed: randomBetween(-0.75, 0.75),
            imageIndex: Math.floor(Math.random() * Math.max(1, assetImages.asteroids.length)),
            shape
        });
    }

    function spawnLargeAsteroid()
    {
        let x = 0;
        let y = 0;
        let attempts = 0;
        do
        {
            const edge = Math.floor(Math.random() * 4);
            if (edge === 0)
            {
                x = randomBetween(0, logicalWidth);
                y = -48;
            }
            else if (edge === 1)
            {
                x = logicalWidth + 48;
                y = randomBetween(0, logicalHeight);
            }
            else if (edge === 2)
            {
                x = randomBetween(0, logicalWidth);
                y = logicalHeight + 48;
            }
            else
            {
                x = -48;
                y = randomBetween(0, logicalHeight);
            }
            attempts += 1;
        }
        while (Math.hypot(x - ship.x, y - ship.y) < config.asteroids.safeSpawnRadius && attempts < 12);

        const directionToCenter = Math.atan2(logicalHeight / 2 - y, logicalWidth / 2 - x);
        createAsteroid("large", x, y, directionToCenter + randomBetween(-0.7, 0.7));
    }

    function spawnWave(playSound = true)
    {
        asteroids.length = 0;
        const count = config.game.startingAsteroids + (state.wave - 1) * config.game.asteroidsPerWave;
        for (let index = 0; index < count; index += 1)
        {
            spawnLargeAsteroid();
        }
        if (playSound)
        {
            audioController.play("wave");
        }
    }

    function updateStatus()
    {
        scoreElement.textContent = String(state.score).padStart(config.game.scoreDigits, "0");
        waveElement.textContent = String(state.wave).padStart(config.game.waveDigits, "0");
        const full = "♥ ".repeat(state.lives).trim();
        const empty = "♡ ".repeat(Math.max(0, config.game.startingLives - state.lives)).trim();
        livesElement.textContent = [full, empty].filter(Boolean).join(" ");
        livesElement.setAttribute("aria-label", `剩余${state.lives}点体力`);
    }

    function showMessage(kicker, title, detail, actionText)
    {
        messageKicker.textContent = kicker;
        messageTitle.textContent = title;
        messageDetail.textContent = detail;
        stageAction.textContent = actionText;
        stageMessage.classList.remove("is-hidden");
    }

    function hideMessage()
    {
        stageMessage.classList.add("is-hidden");
    }

    function resetGame()
    {
        state.mode = "ready";
        state.score = 0;
        state.wave = 1;
        state.lives = config.game.startingLives;
        state.lastShotAt = -Infinity;
        bullets.length = 0;
        particles.length = 0;
        Object.keys(keys).forEach((key) => { keys[key] = false; });
        resetShip();
        spawnWave(false);
        updateStatus();
        pauseLabel.textContent = "暂停";
        showMessage("0721", "宁宁，快跑！", "躲开起爆器并把它们全部击碎", "开始逃生");
    }

    function startOrContinue()
    {
        audioController.unlock();
        if (state.mode === "ready")
        {
            state.mode = "running";
            resetShip();
            hideMessage();
        }
        else if (state.mode === "respawning")
        {
            state.mode = "running";
            resetShip();
            hideMessage();
        }
        else if (state.mode === "waveClear")
        {
            state.wave += 1;
            resetShip();
            spawnWave();
            updateStatus();
            state.mode = "running";
            hideMessage();
        }
        else if (state.mode === "paused")
        {
            state.mode = "running";
            pauseLabel.textContent = "暂停";
            hideMessage();
        }
        else if (state.mode === "gameOver")
        {
            resetGame();
            state.mode = "running";
            resetShip();
            hideMessage();
        }
        canvas.focus({ preventScroll: true });
    }

    function togglePause()
    {
        if (state.mode === "running")
        {
            state.mode = "paused";
            pauseLabel.textContent = "继续";
            showMessage("0721", "危机暂停", "宁宁与起爆器已停住", "继续逃生");
        }
        else if (state.mode === "paused")
        {
            startOrContinue();
        }
    }

    function fireBullet(timestamp)
    {
        if (state.mode !== "running" || timestamp - state.lastShotAt < config.ship.fireCooldownMs)
        {
            return;
        }

        state.lastShotAt = timestamp;
        const noseDistance = config.ship.radius + 5;
        bullets.push({
            x: ship.x + Math.cos(ship.angle) * noseDistance,
            y: ship.y + Math.sin(ship.angle) * noseDistance,
            dx: ship.dx + Math.cos(ship.angle) * config.bullet.speed,
            dy: ship.dy + Math.sin(ship.angle) * config.bullet.speed,
            angle: ship.angle,
            remainingMs: config.bullet.lifetimeMs
        });
        audioController.play("shoot");
    }

    function createExplosion(x, y, color, amount, speed)
    {
        for (let index = 0; index < amount; index += 1)
        {
            const angle = Math.random() * Math.PI * 2;
            const velocity = randomBetween(speed * 0.35, speed);
            particles.push({
                x,
                y,
                dx: Math.cos(angle) * velocity,
                dy: Math.sin(angle) * velocity,
                radius: randomBetween(1, 3.4),
                life: randomBetween(0.28, 0.75),
                maximumLife: 0.75,
                color
            });
        }
    }

    function destroyAsteroid(index)
    {
        const asteroid = asteroids[index];
        const settings = config.asteroids.sizes[asteroid.sizeName];
        asteroids.splice(index, 1);
        state.score += settings.score;
        updateStatus();
        createExplosion(asteroid.x, asteroid.y, config.scene.asteroidEdge, asteroid.sizeName === "large" ? 18 : 11, 145);

        if (settings.splitInto)
        {
            const baseAngle = Math.atan2(asteroid.dy, asteroid.dx);
            for (let split = 0; split < config.asteroids.splitCount; split += 1)
            {
                const spread = split % 2 === 0 ? -0.72 : 0.72;
                createAsteroid(settings.splitInto, asteroid.x, asteroid.y, baseAngle + spread + randomBetween(-0.18, 0.18));
            }
            audioController.play("hit");
        }
        else
        {
            audioController.play("explode");
        }
    }

    function shipHit()
    {
        if (performance.now() < ship.invulnerableUntil || state.mode !== "running")
        {
            return;
        }

        state.lives -= 1;
        updateStatus();
        createExplosion(ship.x, ship.y, config.scene.accentColor, 32, 210);
        bullets.length = 0;

        if (state.lives <= 0)
        {
            state.mode = "gameOver";
            audioController.play("lose");
            showMessage("0721", "体力耗尽", `宁宁最终坚持了 ${state.score} 分`, "重新逃生");
            window.CialloLeaderboard?.reportScore(state.score);
        }
        else
        {
            state.mode = "respawning";
            audioController.play("explode");
            showMessage("0721", "宁宁被起爆器追上", `还有 ${state.lives} 点体力`, "继续逃生");
        }
    }

    function circleCollision(firstX, firstY, firstRadius, secondX, secondY, secondRadius)
    {
        const dx = firstX - secondX;
        const dy = firstY - secondY;
        const radius = firstRadius + secondRadius;
        return dx * dx + dy * dy <= radius * radius;
    }

    function handleCollisions()
    {
        for (let bulletIndex = bullets.length - 1; bulletIndex >= 0; bulletIndex -= 1)
        {
            const bullet = bullets[bulletIndex];
            let hit = false;
            for (let asteroidIndex = asteroids.length - 1; asteroidIndex >= 0; asteroidIndex -= 1)
            {
                const asteroid = asteroids[asteroidIndex];
                const radius = config.asteroids.sizes[asteroid.sizeName].radius;
                if (circleCollision(bullet.x, bullet.y, config.bullet.radius, asteroid.x, asteroid.y, radius))
                {
                    bullets.splice(bulletIndex, 1);
                    destroyAsteroid(asteroidIndex);
                    hit = true;
                    break;
                }
            }
            if (hit)
            {
                continue;
            }
        }

        if (performance.now() >= ship.invulnerableUntil)
        {
            for (const asteroid of asteroids)
            {
                const radius = config.asteroids.sizes[asteroid.sizeName].radius;
                if (circleCollision(ship.x, ship.y, config.ship.radius, asteroid.x, asteroid.y, radius))
                {
                    shipHit();
                    break;
                }
            }
        }

        if (asteroids.length === 0 && state.mode === "running")
        {
            state.mode = "waveClear";
            audioController.play("wave");
            showMessage("0721", `第 ${state.wave} 次危机解除`, "下一波会出现更多起爆器", "继续逃生");
        }
    }

    function update(deltaTime, timestamp)
    {
        state.elapsed += deltaTime;

        for (let index = particles.length - 1; index >= 0; index -= 1)
        {
            const particle = particles[index];
            particle.x += particle.dx * deltaTime;
            particle.y += particle.dy * deltaTime;
            particle.dx *= Math.pow(0.22, deltaTime);
            particle.dy *= Math.pow(0.22, deltaTime);
            particle.life -= deltaTime;
            if (particle.life <= 0)
            {
                particles.splice(index, 1);
            }
        }

        if (state.mode !== "running")
        {
            return;
        }

        const turn = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
        ship.angle += turn * config.ship.rotationSpeed * deltaTime;

        if (keys.thrust)
        {
            ship.dx += Math.cos(ship.angle) * config.ship.thrust * deltaTime;
            ship.dy += Math.sin(ship.angle) * config.ship.thrust * deltaTime;
            if (Math.random() > 0.35)
            {
                const exhaustAngle = ship.angle + Math.PI + randomBetween(-0.22, 0.22);
                particles.push({
                    x: ship.x - Math.cos(ship.angle) * 15,
                    y: ship.y - Math.sin(ship.angle) * 15,
                    dx: Math.cos(exhaustAngle) * randomBetween(60, 130),
                    dy: Math.sin(exhaustAngle) * randomBetween(60, 130),
                    radius: randomBetween(1, 2.6),
                    life: randomBetween(0.18, 0.35),
                    maximumLife: 0.35,
                    color: config.scene.accentColor
                });
            }
        }

        const drag = Math.pow(config.ship.dragPerSecond, deltaTime);
        ship.dx *= drag;
        ship.dy *= drag;
        const shipSpeed = Math.hypot(ship.dx, ship.dy);
        if (shipSpeed > config.ship.maximumSpeed)
        {
            ship.dx = ship.dx / shipSpeed * config.ship.maximumSpeed;
            ship.dy = ship.dy / shipSpeed * config.ship.maximumSpeed;
        }

        ship.x += ship.dx * deltaTime;
        ship.y += ship.dy * deltaTime;
        wrap(ship, config.ship.radius);

        if (keys.fire)
        {
            fireBullet(timestamp);
        }

        for (let index = bullets.length - 1; index >= 0; index -= 1)
        {
            const bullet = bullets[index];
            bullet.x += bullet.dx * deltaTime;
            bullet.y += bullet.dy * deltaTime;
            bullet.remainingMs -= deltaTime * 1000;
            wrap(bullet, config.bullet.radius);
            if (bullet.remainingMs <= 0)
            {
                bullets.splice(index, 1);
            }
        }

        for (const asteroid of asteroids)
        {
            asteroid.x += asteroid.dx * deltaTime;
            asteroid.y += asteroid.dy * deltaTime;
            asteroid.angle += asteroid.rotationSpeed * deltaTime;
            wrap(asteroid, config.asteroids.sizes[asteroid.sizeName].radius);
        }

        handleCollisions();
    }

    function drawImageCover(image, x, y, width, height)
    {
        const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
        const sourceWidth = width / scale;
        const sourceHeight = height / scale;
        const sourceX = (image.naturalWidth - sourceWidth) / 2;
        const sourceY = (image.naturalHeight - sourceHeight) / 2;
        context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
    }

    function drawBackground()
    {
        const gradient = context.createLinearGradient(0, 0, 0, logicalHeight);
        gradient.addColorStop(0, config.scene.backgroundTop);
        gradient.addColorStop(1, config.scene.backgroundBottom);
        context.fillStyle = gradient;
        context.fillRect(0, 0, logicalWidth, logicalHeight);

        if (assetImages.background?.complete && assetImages.background.naturalWidth)
        {
            context.save();
            context.globalAlpha = 0.7;
            drawImageCover(assetImages.background, 0, 0, logicalWidth, logicalHeight);
            context.restore();
        }

        for (const star of stars)
        {
            const flicker = 0.72 + Math.sin(state.elapsed * star.twinkle + star.phase) * 0.28;
            context.globalAlpha = star.alpha * flicker;
            context.fillStyle = config.scene.starColor;
            context.beginPath();
            context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            context.fill();
        }
        context.globalAlpha = 1;

        const glow = context.createRadialGradient(logicalWidth / 2, logicalHeight / 2, 20, logicalWidth / 2, logicalHeight / 2, 310);
        glow.addColorStop(0, "rgba(94, 130, 255, 0.055)");
        glow.addColorStop(1, "rgba(0, 0, 0, 0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, logicalWidth, logicalHeight);
    }

    function drawShip(timestamp)
    {
        if ((timestamp < ship.invulnerableUntil) && Math.floor(timestamp / 90) % 2 === 0)
        {
            return;
        }

        context.save();
        context.translate(ship.x, ship.y);
        context.shadowColor = config.scene.accentColor;
        context.shadowBlur = 15;

        if (assetImages.ship?.complete && assetImages.ship.naturalWidth)
        {
            context.rotate(ship.angle + Math.PI / 2 + config.ship.imageRotationOffset);
            context.drawImage(
                assetImages.ship,
                -config.ship.drawWidth / 2,
                -config.ship.drawHeight / 2,
                config.ship.drawWidth,
                config.ship.drawHeight
            );
            context.restore();
            return;
        }

        context.rotate(ship.angle);
        context.beginPath();
        context.moveTo(23, 0);
        context.lineTo(-14, -13);
        context.lineTo(-7, 0);
        context.lineTo(-14, 13);
        context.closePath();
        const gradient = context.createLinearGradient(-14, 0, 23, 0);
        gradient.addColorStop(0, config.scene.shipAccent);
        gradient.addColorStop(1, config.scene.shipColor);
        context.fillStyle = gradient;
        context.fill();
        context.strokeStyle = "rgba(255, 255, 255, .92)";
        context.lineWidth = 1.5;
        context.stroke();

        context.beginPath();
        context.arc(3, 0, 4.4, 0, Math.PI * 2);
        context.fillStyle = config.scene.accentColor;
        context.fill();

        if (keys.thrust && state.mode === "running")
        {
            context.beginPath();
            context.moveTo(-10, -6);
            context.lineTo(-25 - Math.random() * 8, 0);
            context.lineTo(-10, 6);
            context.strokeStyle = "#ffcf79";
            context.lineWidth = 3;
            context.stroke();
        }
        context.restore();
    }

    function drawBullet(bullet)
    {
        context.save();
        context.translate(bullet.x, bullet.y);
        context.rotate(bullet.angle + Math.PI / 2);
        context.shadowColor = config.scene.bulletColor;
        context.shadowBlur = 12;

        if (assetImages.bullet?.complete && assetImages.bullet.naturalWidth)
        {
            context.drawImage(
                assetImages.bullet,
                -config.bullet.drawWidth / 2,
                -config.bullet.drawHeight / 2,
                config.bullet.drawWidth,
                config.bullet.drawHeight
            );
        }
        else
        {
            context.fillStyle = config.scene.bulletColor;
            context.beginPath();
            context.arc(0, 0, config.bullet.radius, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
    }

    function drawAsteroid(asteroid)
    {
        const settings = config.asteroids.sizes[asteroid.sizeName];
        const image = assetImages.asteroids[asteroid.imageIndex];
        context.save();
        context.translate(asteroid.x, asteroid.y);
        context.rotate(asteroid.angle);
        context.shadowColor = "rgba(124, 144, 210, .28)";
        context.shadowBlur = 12;

        if (image?.complete && image.naturalWidth)
        {
            context.drawImage(image, -settings.drawSize / 2, -settings.drawSize / 2, settings.drawSize, settings.drawSize);
            context.restore();
            return;
        }

        context.beginPath();
        asteroid.shape.forEach((factor, index) => {
            const angle = index / asteroid.shape.length * Math.PI * 2;
            const radius = settings.radius * factor;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        });
        context.closePath();
        const gradient = context.createRadialGradient(-settings.radius * 0.25, -settings.radius * 0.3, 2, 0, 0, settings.radius);
        gradient.addColorStop(0, "#a5acc9");
        gradient.addColorStop(1, config.scene.asteroidColor);
        context.fillStyle = gradient;
        context.fill();
        context.strokeStyle = config.scene.asteroidEdge;
        context.globalAlpha = 0.74;
        context.lineWidth = 1.4;
        context.stroke();

        context.globalAlpha = 0.22;
        context.fillStyle = "#0a0e20";
        context.beginPath();
        context.arc(-settings.radius * 0.18, -settings.radius * 0.1, settings.radius * 0.19, 0, Math.PI * 2);
        context.arc(settings.radius * 0.28, settings.radius * 0.2, settings.radius * 0.13, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }

    function drawParticles()
    {
        for (const particle of particles)
        {
            context.globalAlpha = clamp(particle.life / particle.maximumLife, 0, 1);
            context.fillStyle = particle.color;
            context.beginPath();
            context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
            context.fill();
        }
        context.globalAlpha = 1;
    }

    function render(timestamp)
    {
        context.clearRect(0, 0, logicalWidth, logicalHeight);
        drawBackground();
        asteroids.forEach(drawAsteroid);
        bullets.forEach(drawBullet);
        drawParticles();
        if (state.mode !== "gameOver")
        {
            drawShip(timestamp);
        }

        context.strokeStyle = "rgba(120, 220, 255, .12)";
        context.lineWidth = 1;
        context.strokeRect(0.5, 0.5, logicalWidth - 1, logicalHeight - 1);
    }

    function loop(timestamp)
    {
        const deltaTime = state.lastTimestamp
            ? Math.min(0.025, (timestamp - state.lastTimestamp) / 1000)
            : 0;
        state.lastTimestamp = timestamp;
        update(deltaTime, timestamp);
        render(timestamp);
        window.requestAnimationFrame(loop);
    }

    function setKeyFromCode(code, pressed)
    {
        if (code === "ArrowLeft" || code === "KeyA") keys.left = pressed;
        if (code === "ArrowRight" || code === "KeyD") keys.right = pressed;
        if (code === "ArrowUp" || code === "KeyW") keys.thrust = pressed;
        if (code === "Space") keys.fire = pressed;
    }

    document.addEventListener("keydown", (event) => {
        const controlledCodes = ["ArrowLeft", "ArrowRight", "ArrowUp", "KeyA", "KeyD", "KeyW", "Space"];
        if (controlledCodes.includes(event.code))
        {
            event.preventDefault();
            audioController.unlock();
        }

        if (event.code === "Space" && state.mode !== "running")
        {
            if (!event.repeat) startOrContinue();
            return;
        }

        if (event.code === "Space" && !event.repeat)
        {
            fireBullet(performance.now());
        }

        if (event.code === "KeyP" && !event.repeat)
        {
            togglePause();
            return;
        }

        if (event.code === "KeyR" && !event.repeat)
        {
            resetGame();
            return;
        }

        if (event.code === "KeyM" && !event.repeat)
        {
            updateMuteState(audioController.toggleMute());
            return;
        }

        setKeyFromCode(event.code, true);
    });

    document.addEventListener("keyup", (event) => {
        setKeyFromCode(event.code, false);
    });

    window.addEventListener("blur", () => {
        Object.keys(keys).forEach((key) => { keys[key] = false; });
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden && state.mode === "running")
        {
            togglePause();
        }
    });

    function bindHoldButton(id, key)
    {
        const button = document.getElementById(id);
        const release = () => {
            keys[key] = false;
            button.classList.remove("is-active");
        };
        button.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            audioController.unlock();
            keys[key] = true;
            button.classList.add("is-active");
            button.setPointerCapture?.(event.pointerId);
            if (key === "fire")
            {
                fireBullet(performance.now());
            }
        });
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("lostpointercapture", release);
    }

    bindHoldButton("left-button", "left");
    bindHoldButton("right-button", "right");
    bindHoldButton("thrust-button", "thrust");
    bindHoldButton("fire-button", "fire");

    stageAction.addEventListener("click", startOrContinue);
    pauseButton.addEventListener("click", togglePause);
    document.getElementById("reset-button").addEventListener("click", resetGame);
    muteButton.addEventListener("click", () => {
        updateMuteState(audioController.toggleMute());
    });

    canvas.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        audioController.unlock();
        if (state.mode === "running")
        {
            fireBullet(performance.now());
        }
        else
        {
            startOrContinue();
        }
    });

    function updateMuteState(muted)
    {
        muteButton.setAttribute("aria-pressed", String(muted));
        muteIcon.textContent = muted ? "×" : "♪";
        muteLabel.textContent = muted ? "声音关闭" : "声音开启";
    }

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
    createStars();
    resetGame();
    window.requestAnimationFrame(loop);
})();
