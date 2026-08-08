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
    const state = {
        entries: [],
        pendingScore: null,
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
                    <ol class="leaderboard-list"></ol>
                    <form class="leaderboard-form" hidden>
                        <p class="leaderboard-form-title">
                            新成绩 <strong class="leaderboard-form-score"></strong> 分进入前十！
                        </p>
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
    const form = root.querySelector(".leaderboard-form");
    const formScore = root.querySelector(".leaderboard-form-score");
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

            const player = document.createElement("span");
            player.className = "leaderboard-player";
            player.textContent = entry.nickname;
            player.title = entry.nickname;

            const score = document.createElement("strong");
            score.className = "leaderboard-score";
            score.textContent = Number(entry.score).toLocaleString("zh-CN");

            item.append(rank, player, score);
            listElement.append(item);
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
            state.loaded = true;
            renderEntries();
            setStatus(state.entries.length > 0 ? "当前前十名" : "还没有玩家留下成绩");
            return true;
        }
        catch (error)
        {
            state.loaded = false;
            state.entries = [];
            renderEntries();
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
        document.body.classList.remove("leaderboard-open");
        if (previouslyFocused && typeof previouslyFocused.focus === "function")
        {
            previouslyFocused.focus({ preventScroll: true });
        }
    }

    function scoreQualifies(score)
    {
        if (state.entries.length < 10)
        {
            return true;
        }
        const tenthScore = Number(state.entries[state.entries.length - 1].score) || 0;
        return score > tenthScore;
    }

    async function reportScore(rawScore)
    {
        const score = Math.floor(Number(rawScore));
        if (!Number.isSafeInteger(score) || score <= 0)
        {
            return;
        }

        openDialog();
        form.hidden = true;
        const available = await loadEntries();
        if (!available)
        {
            return;
        }

        if (!scoreQualifies(score))
        {
            setStatus(`本局 ${score.toLocaleString("zh-CN")} 分，暂未进入前十。`);
            return;
        }

        state.pendingScore = score;
        formScore.textContent = score.toLocaleString("zh-CN");
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
                body: JSON.stringify({ nickname, score: state.pendingScore })
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
