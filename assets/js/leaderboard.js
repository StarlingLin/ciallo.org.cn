(() =>
{
    "use strict";

    const root = document.getElementById("leaderboard-root");
    if (!root)
    {
        return;
    }

    const gameId = root.dataset.gameId;
    const gameName = root.dataset.gameName || gameId;
    const apiUrl = `/api/leaderboards/${encodeURIComponent(gameId)}`;
    const characterTotalsUrl = `${apiUrl}/totals`;
    let characters = [];
    try
    {
        const parsed = JSON.parse(root.dataset.characters || "[]");
        if (Array.isArray(parsed))
        {
            characters = parsed.filter((character) =>
                character && typeof character.id === "string" && typeof character.name === "string"
            );
        }
    }
    catch (error)
    {
        characters = [];
    }
    const characterMap = new Map(characters.map((character) => [character.id, character]));
    const state = {
        entries: [],
        characterTotals: [],
        pendingScore: null,
        pendingDetails: null,
        loaded: false,
        submitting: false
    };

    root.className = "ciallo-leaderboard";
    root.innerHTML = `
        <button class="leaderboard-trigger" type="button" aria-haspopup="dialog">
            <span aria-hidden="true">🏆</span>
            <span>排行榜</span>
        </button>
        <div class="leaderboard-backdrop" hidden>
            <section class="leaderboard-dialog"
                     role="dialog"
                     aria-modal="true"
                     aria-labelledby="leaderboard-title">
                <header class="leaderboard-header">
                    <div>
                        <p class="leaderboard-eyebrow">TOP 10</p>
                        <h2 class="leaderboard-title" id="leaderboard-title">玩家排行榜</h2>
                        <span class="leaderboard-game-name"></span>
                    </div>
                    <button class="leaderboard-close" type="button" aria-label="关闭排行榜">×</button>
                </header>
                <div class="leaderboard-content">
                    <p class="leaderboard-status" aria-live="polite">正在读取排行榜…</p>
                    <section class="leaderboard-section">
                        <h3 class="leaderboard-section-title">玩家总榜</h3>
                        <ol class="leaderboard-list"></ol>
                    </section>
                    <section class="leaderboard-section leaderboard-character-section" hidden>
                        <div class="leaderboard-section-heading">
                            <h3 class="leaderboard-section-title">角色累计总分</h3>
                            <span>按累计分从高到低</span>
                        </div>
                        <ol class="leaderboard-character-list"></ol>
                    </section>
                    <form class="leaderboard-form" hidden>
                        <p class="leaderboard-form-title">
                            新成绩 <strong class="leaderboard-form-score"></strong> 分进入前十！
                        </p>
                        <p class="leaderboard-form-details" hidden></p>
                        <label class="leaderboard-field-label" for="leaderboard-nickname">
                            填写昵称后保存成绩（最多 16 个字符）
                        </label>
                        <div class="leaderboard-form-row">
                            <input class="leaderboard-nickname"
                                   id="leaderboard-nickname"
                                   name="nickname"
                                   type="text"
                                   maxlength="16"
                                   autocomplete="nickname"
                                   placeholder="你的昵称"
                                   required>
                            <button class="leaderboard-submit" type="button">保存成绩</button>
                        </div>
                        <p class="leaderboard-privacy">昵称会经过服务端屏蔽词、网址和联系方式检定。</p>
                    </form>
                </div>
            </section>
        </div>
    `;

    const trigger = root.querySelector(".leaderboard-trigger");
    const backdrop = root.querySelector(".leaderboard-backdrop");
    const dialog = root.querySelector(".leaderboard-dialog");
    const closeButton = root.querySelector(".leaderboard-close");
    const gameNameElement = root.querySelector(".leaderboard-game-name");
    const statusElement = root.querySelector(".leaderboard-status");
    const listElement = root.querySelector(".leaderboard-list");
    const characterSection = root.querySelector(".leaderboard-character-section");
    const characterList = root.querySelector(".leaderboard-character-list");
    const form = root.querySelector(".leaderboard-form");
    const formScore = root.querySelector(".leaderboard-form-score");
    const formDetails = root.querySelector(".leaderboard-form-details");
    const nicknameInput = root.querySelector(".leaderboard-nickname");
    const submitButton = root.querySelector(".leaderboard-submit");
    let previouslyFocused = null;

    gameNameElement.textContent = gameName;

    function setStatus(message, kind = "")
    {
        statusElement.textContent = message;
        statusElement.classList.toggle("is-success", kind === "success");
        statusElement.classList.toggle("is-error", kind === "error");
    }

    function formatDuration(rawSeconds)
    {
        const seconds = Math.max(0, Math.floor(Number(rawSeconds) || 0));
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainder = seconds % 60;
        if (hours > 0)
        {
            return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
        }
        return `${minutes}:${String(remainder).padStart(2, "0")}`;
    }

    function createCharacterAvatar(character, className)
    {
        if (!character || !character.image)
        {
            return null;
        }
        const image = document.createElement("img");
        image.className = className;
        image.src = character.image;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        return image;
    }

    function renderEntries()
    {
        listElement.replaceChildren();
        if (state.entries.length === 0)
        {
            const empty = document.createElement("li");
            empty.className = "leaderboard-empty";
            empty.textContent = "排行榜还是空的，第一名正在等你。";
            listElement.append(empty);
            return;
        }

        state.entries.forEach((entry, index) =>
        {
            const item = document.createElement("li");
            item.className = "leaderboard-entry";

            const rank = document.createElement("span");
            rank.className = "leaderboard-rank";
            rank.textContent = `#${entry.rank || index + 1}`;

            const identity = document.createElement("span");
            identity.className = "leaderboard-identity";
            const character = characterMap.get(entry.skin_id);
            const avatar = createCharacterAvatar(character, "leaderboard-avatar");
            if (avatar)
            {
                identity.append(avatar);
            }

            const playerBlock = document.createElement("span");
            playerBlock.className = "leaderboard-player-block";
            const player = document.createElement("span");
            player.className = "leaderboard-player";
            player.textContent = entry.nickname;
            player.title = entry.nickname;
            playerBlock.append(player);
            if (entry.skin_name)
            {
                const skin = document.createElement("small");
                skin.className = "leaderboard-skin-name";
                skin.textContent = entry.skin_name;
                playerBlock.append(skin);
            }
            identity.append(playerBlock);

            const result = document.createElement("span");
            result.className = "leaderboard-result";
            const score = document.createElement("strong");
            score.className = "leaderboard-score";
            score.textContent = Number(entry.score).toLocaleString("zh-CN");
            result.append(score);
            if (Number.isInteger(entry.survival_seconds))
            {
                const survival = document.createElement("small");
                survival.className = "leaderboard-survival";
                survival.textContent = `存活 ${formatDuration(entry.survival_seconds)}`;
                result.append(survival);
            }

            item.append(rank, identity, result);
            listElement.append(item);
        });
    }

    function renderCharacterTotals()
    {
        characterSection.hidden = characters.length === 0;
        characterList.replaceChildren();
        if (characters.length === 0)
        {
            return;
        }

        const totalsById = new Map(
            state.characterTotals.map((entry) => [entry.skin_id, entry])
        );
        const ordered = characters
            .map((character, index) => ({
                ...character,
                ...totalsById.get(character.id),
                originalOrder: index
            }))
            .sort((first, second) =>
                (Number(second.total_score) || 0) - (Number(first.total_score) || 0) ||
                first.originalOrder - second.originalOrder
            );

        ordered.forEach((character, index) =>
        {
            const item = document.createElement("li");
            item.className = "leaderboard-character-entry";

            const rank = document.createElement("span");
            rank.className = "leaderboard-character-rank";
            rank.textContent = `#${index + 1}`;

            const avatar = createCharacterAvatar(character, "leaderboard-character-avatar");
            const name = document.createElement("strong");
            name.className = "leaderboard-character-name";
            name.textContent = character.name;

            const score = document.createElement("span");
            score.className = "leaderboard-character-score";
            score.textContent = `${Number(character.total_score || 0).toLocaleString("zh-CN")} 分`;
            score.title = `${Number(character.play_count || 0).toLocaleString("zh-CN")} 局，累计存活 ${formatDuration(character.total_survival_seconds || 0)}`;

            item.append(rank);
            if (avatar)
            {
                item.append(avatar);
            }
            item.append(name, score);
            characterList.append(item);
        });
    }

    async function requestJson(url, options)
    {
        const response = await fetch(url, {
            credentials: "same-origin",
            cache: "no-store",
            ...options
        });
        let payload = {};
        try
        {
            payload = await response.json();
        }
        catch (error)
        {
            payload = {};
        }
        if (!response.ok)
        {
            throw new Error(payload.message || "排行榜服务暂时不可用。");
        }
        return payload;
    }

    async function loadEntries()
    {
        setStatus("正在读取排行榜…");
        try
        {
            const payload = await requestJson(apiUrl);
            state.entries = Array.isArray(payload.entries) ? payload.entries : [];
            state.characterTotals = Array.isArray(payload.character_totals)
                ? payload.character_totals
                : [];
            state.loaded = true;
            renderEntries();
            renderCharacterTotals();
            setStatus(state.entries.length > 0 ? "当前前十名" : "还没有玩家留下成绩");
            return true;
        }
        catch (error)
        {
            state.loaded = false;
            state.entries = [];
            state.characterTotals = [];
            renderEntries();
            renderCharacterTotals();
            setStatus(error.message, "error");
            return false;
        }
    }

    function openDialog()
    {
        previouslyFocused = document.activeElement;
        backdrop.hidden = false;
        document.body.classList.add("leaderboard-open");
        closeButton.focus({ preventScroll: true });
    }

    function closeDialog()
    {
        backdrop.hidden = true;
        form.hidden = true;
        state.pendingScore = null;
        state.pendingDetails = null;
        document.body.classList.remove("leaderboard-open");
        if (previouslyFocused && typeof previouslyFocused.focus === "function")
        {
            previouslyFocused.focus({ preventScroll: true });
        }
    }

    function scoreQualifies(score, details = null)
    {
        if (state.entries.length < 10)
        {
            return true;
        }
        const tenth = state.entries[state.entries.length - 1];
        const tenthScore = Number(tenth.score) || 0;
        if (score > tenthScore)
        {
            return true;
        }
        return Boolean(
            details &&
            score === tenthScore &&
            details.survivalSeconds > (Number(tenth.survival_seconds) || -1)
        );
    }

    function normalizeDetails(details)
    {
        if (characters.length === 0)
        {
            return null;
        }
        const skinId = typeof details?.skinId === "string" ? details.skinId : "";
        const survivalSeconds = Math.max(0, Math.floor(Number(details?.survivalSeconds)));
        if (!characterMap.has(skinId) || !Number.isSafeInteger(survivalSeconds))
        {
            return null;
        }
        return { skinId, survivalSeconds };
    }

    async function recordCharacterTotal(score, details)
    {
        if (!details)
        {
            return;
        }
        try
        {
            const payload = await requestJson(characterTotalsUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    score,
                    skin_id: details.skinId,
                    survival_seconds: details.survivalSeconds
                })
            });
            state.characterTotals = Array.isArray(payload.character_totals)
                ? payload.character_totals
                : state.characterTotals;
            renderCharacterTotals();
        }
        catch (error)
        {
            console.warn("角色累计总分提交失败：", error);
        }
    }

    async function reportScore(rawScore, rawDetails = null)
    {
        const score = Math.floor(Number(rawScore));
        if (!Number.isSafeInteger(score) || score <= 0)
        {
            return;
        }

        openDialog();
        form.hidden = true;
        const details = normalizeDetails(rawDetails);
        await recordCharacterTotal(score, details);
        const available = await loadEntries();
        if (!available)
        {
            return;
        }

        if (!scoreQualifies(score, details))
        {
            setStatus(`本局 ${score.toLocaleString("zh-CN")} 分，暂未进入前十。`);
            return;
        }

        state.pendingScore = score;
        state.pendingDetails = details;
        formScore.textContent = score.toLocaleString("zh-CN");
        if (details)
        {
            const character = characterMap.get(details.skinId);
            formDetails.textContent = `${character.name} · 存活 ${formatDuration(details.survivalSeconds)}`;
            formDetails.hidden = false;
        }
        else
        {
            formDetails.hidden = true;
        }
        form.hidden = false;
        setStatus("恭喜进入前十，填写昵称即可保存成绩。", "success");
        try
        {
            nicknameInput.value = window.localStorage.getItem("ciallo-leaderboard-nickname") || "";
        }
        catch (error)
        {
            nicknameInput.value = "";
        }
        nicknameInput.focus({ preventScroll: true });
        nicknameInput.select();
    }

    async function submitScore(event)
    {
        event.preventDefault();
        if (state.submitting || state.pendingScore === null)
        {
            return;
        }

        const nickname = nicknameInput.value.trim();
        if (!nickname)
        {
            setStatus("请先填写昵称。", "error");
            nicknameInput.focus();
            return;
        }

        state.submitting = true;
        nicknameInput.disabled = true;
        submitButton.disabled = true;
        setStatus("正在保存成绩…");

        try
        {
            const payload = await requestJson(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    nickname,
                    score: state.pendingScore,
                    skin_id: state.pendingDetails?.skinId,
                    survival_seconds: state.pendingDetails?.survivalSeconds
                })
            });
            state.entries = Array.isArray(payload.entries) ? payload.entries : [];
            renderEntries();

            if (payload.accepted)
            {
                try
                {
                    window.localStorage.setItem("ciallo-leaderboard-nickname", nickname);
                }
                catch (error)
                {
                    // Private browsing may disable local storage; saving the score still succeeds.
                }
                setStatus(`成绩已保存，目前排名第 ${payload.rank} 名。`, "success");
                form.hidden = true;
                state.pendingScore = null;
                state.pendingDetails = null;
            }
            else if (payload.reason === "not_improved")
            {
                setStatus("这个昵称已经有更高成绩，本次记录未覆盖。", "error");
            }
            else
            {
                setStatus("提交时榜单发生变化，本次成绩未能进入前十。", "error");
                form.hidden = true;
                state.pendingScore = null;
                state.pendingDetails = null;
            }
        }
        catch (error)
        {
            setStatus(error.message, "error");
        }
        finally
        {
            state.submitting = false;
            nicknameInput.disabled = false;
            submitButton.disabled = false;
        }
    }

    trigger.addEventListener("click", () =>
    {
        openDialog();
        form.hidden = true;
        loadEntries();
    });
    closeButton.addEventListener("click", closeDialog);
    backdrop.addEventListener("pointerdown", (event) =>
    {
        if (event.target === backdrop)
        {
            closeDialog();
        }
    });
    dialog.addEventListener("keydown", (event) =>
    {
        event.stopPropagation();
        if (event.key === "Escape")
        {
            event.preventDefault();
            closeDialog();
        }
    });
    submitButton.addEventListener("click", submitScore);
    nicknameInput.addEventListener("keydown", (event) =>
    {
        if (event.key === "Enter")
        {
            submitScore(event);
        }
    });

    window.CialloLeaderboard = Object.freeze({
        open: () =>
        {
            openDialog();
            form.hidden = true;
            return loadEntries();
        },
        refresh: loadEntries,
        reportScore
    });
})();
