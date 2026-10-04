document.addEventListener('DOMContentLoaded', async () => {
    const IDENTIFIER = 'die-dr3i-hoerspiele-herrgemmel';
    const IA_API_URL = `https://archive.org/metadata/${IDENTIFIER}`;
    const DOWNLOAD_URL = `https://archive.org/download/${IDENTIFIER}`;
    const METADATA_API = 'https://dreimetadaten.de/data/DiE_DR3i.json';

    // Views
    const albumsView = document.getElementById('albums-view');
    const albumDetailView = document.getElementById('album-detail-view');
    
    // UI Elements
    const albumsGrid = document.getElementById('albums-grid');
    const trackListEl = document.getElementById('track-list');
    const loadingEl = document.getElementById('loading');
    const backBtn = document.getElementById('back-btn');
    const viewTitle = document.getElementById('view-title');
    
    // Search
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    const searchBar = document.getElementById('search-bar');
    const searchInput = document.getElementById('search-input');
    
    // History
    const historySection = document.getElementById('history-section');
    const historyScroll = document.getElementById('history-scroll');

    // Player Controls
    const playPauseBtn = document.getElementById('play-pause-btn');
    const iconPlay = document.getElementById('icon-play');
    const iconPause = document.getElementById('icon-pause');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const playAlbumBtn = document.getElementById('play-album-btn');
    const speedBtn = document.getElementById('speed-btn');
    const sleepBtn = document.getElementById('sleep-btn');
    const sleepBadge = document.getElementById('sleep-badge');
    const sleepModal = document.getElementById('sleep-modal');
    const closeSleepModalBtn = document.getElementById('close-sleep-modal');

    // Progress Bar
    const progressSlider = document.getElementById('progress-slider');
    const timeCurrent = document.getElementById('time-current');
    const timeTotal = document.getElementById('time-total');

    // Settings
    const settingsToggleBtn = document.getElementById('settings-toggle-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsModalBtn = document.getElementById('close-settings-modal');
    const colorBtns = document.querySelectorAll('.color-btn');

    // Download
    const downloadAlbumBtn = document.getElementById('download-album-btn');
    const downloadFormatSelect = document.getElementById('download-format');
    const downloadProgress = document.getElementById('download-progress');

    // State
    let albums = [];
    let currentAlbum = null;
    let playingQueue = [];
    let currentQueueIndex = -1;
    let playbackSpeed = 1.0;
    const speedOptions = [1.0, 1.25, 1.5, 2.0, 0.8];
    let sleepTimer = null;
    let isDraggingSlider = false;
    
    // Gapless Engine
    const audioA = new Audio();
    const audioB = new Audio();
    audioA.preload = "auto";
    audioB.preload = "auto";
    let activeAudio = audioA;
    let nextAudio = audioB;

    function getBaseName(filename) { return filename.replace(/\.[^/.]+$/, ""); }
    function encodeIAUrl(path) { return path.split('/').map(encodeURIComponent).join('/'); }
    function stringToGradient(str) {
        let hash = 0; for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        const h1 = Math.abs(hash) % 360; const h2 = (h1 + 40) % 360;
        return `linear-gradient(135deg, hsl(${h1}, 60%, 40%), hsl(${h2}, 80%, 20%))`;
    }
    function formatTime(secs) {
        if (isNaN(secs)) return "0:00";
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // Load Theme
    const savedTheme = localStorage.getItem('dr3i-theme');
    if (savedTheme) applyTheme(savedTheme);

    function applyTheme(colorStr) {
        const parts = colorStr.split('|');
        document.documentElement.style.setProperty('--accent', parts[0]);
        document.documentElement.style.setProperty('--accent-hover', parts[1] || parts[0]);
        colorBtns.forEach(btn => {
            if (btn.getAttribute('data-color') === parts[0]) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        localStorage.setItem('dr3i-theme', colorStr);
    }

    colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.getAttribute('data-color') + '|' + btn.getAttribute('data-hover'));
        });
    });

    // Load Data
    try {
        let dreimetadaten = [];
        try {
            const metaRes = await fetch(METADATA_API);
            const metaJson = await metaRes.json();
            dreimetadaten = metaJson.die_dr3i || [];
        } catch (e) { console.warn("Could not load external metadata", e); }

        const response = await fetch(IA_API_URL);
        const data = await response.json();
        if (!data.files) throw new Error("No files found");

        const audioFiles = data.files.filter(f => f.name.match(/\.(mp3|flac|m4a|ogg)$/i));

        const trackGroups = {};
        audioFiles.forEach(f => {
            const base = getBaseName(f.name);
            if (!trackGroups[base]) trackGroups[base] = [];
            trackGroups[base].push(f);
        });

        const albumMap = {};
        Object.keys(trackGroups).sort((a, b) => a.localeCompare(b)).forEach(baseName => {
            const group = trackGroups[baseName];
            
            const formatScore = (f) => {
                if (f.format === 'VBR MP3' || f.name.toLowerCase().endsWith('.mp3')) return 4;
                if (f.format === 'MPEG4 Audio' || f.name.toLowerCase().endsWith('.m4a')) return 3;
                if (f.format === 'Ogg Vorbis' || f.name.toLowerCase().endsWith('.ogg')) return 2;
                if (f.format === 'Flac' || f.name.toLowerCase().endsWith('.flac')) return 1;
                return 0;
            };
            group.sort((a, b) => formatScore(b) - formatScore(a));
            
            let parts = baseName.split('/');
            let folderName = parts.length > 1 ? parts[0] : "Andere";
            let displayTitle = parts.pop(); 
            if (parts.length > 0 && parts[parts.length - 1].toLowerCase().includes("cd")) displayTitle = `${parts[parts.length - 1]} - ${displayTitle}`;

            if (!albumMap[folderName]) {
                let match = null;
                const folderLower = folderName.toLowerCase();
                const matchNum = folderName.match(/^(\d+)/);
                if (matchNum) match = dreimetadaten.find(e => e.nummer === parseInt(matchNum[1], 10));
                if (!match) match = dreimetadaten.find(e => folderLower.includes(e.titel.toLowerCase()));

                albumMap[folderName] = {
                    id: folderName,
                    title: match ? match.titel : folderName,
                    episodeNumber: match ? match.nummer : 999,
                    year: match && match.veröffentlichungsdatum ? match.veröffentlichungsdatum.split('-')[0] : '',
                    coverUrl: match && match.links ? match.links.cover : null,
                    description: match ? (match.gesamtbeschreibung || match.beschreibung) : '',
                    duration: match ? match.gesamtdauer : null, // ms
                    tracks: [],
                    availableFiles: [],
                    gradient: stringToGradient(folderName)
                };
            }

            // Store files for downloading specific formats
            albumMap[folderName].availableFiles.push(group);
            
            const bestFile = group[0];
            albumMap[folderName].tracks.push({
                albumId: folderName,
                albumTitle: albumMap[folderName].title,
                coverUrl: albumMap[folderName].coverUrl,
                title: displayTitle,
                url: `${DOWNLOAD_URL}/${encodeIAUrl(bestFile.name)}`,
                originalName: bestFile.name
            });
        });

        albums = Object.values(albumMap).sort((a, b) => {
            if (a.episodeNumber !== b.episodeNumber) return a.episodeNumber - b.episodeNumber;
            return a.title.localeCompare(b.title);
        });

        loadingEl.style.display = 'none';
        
        if (albums.length === 0) {
            loadingEl.textContent = 'Keine Audiotracks gefunden.';
            loadingEl.style.display = 'flex';
        } else {
            renderAlbumsGrid(albums);
            renderHistory();
        }
    } catch (err) {
        loadingEl.textContent = 'Fehler beim Laden der Episoden.';
        console.error(err);
    }

    function renderAlbumsGrid(albumsToRender) {
        albumsGrid.innerHTML = '';
        albumsToRender.forEach((album) => {
            const card = document.createElement('div');
            card.className = 'album-card';
            let coverHtml = album.coverUrl 
                ? `<img src="${album.coverUrl}" class="cover-image skeleton" loading="lazy" alt="${album.title}" crossorigin="anonymous" onload="this.classList.remove('skeleton')">`
                : `<div class="cover-placeholder" style="background: ${album.gradient}">3</div>`;
            const metaText = album.year ? `Hörspiel • ${album.year}` : `Hörspiel`;

            card.innerHTML = `<div class="cover-container">${coverHtml}</div><div class="album-card-title">${album.title}</div><div class="album-card-subtitle">${metaText}</div>`;
            card.addEventListener('click', () => openAlbum(album));
            albumsGrid.appendChild(card);
        });
    }

    // Settings
    settingsToggleBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    closeSettingsModalBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

    // Search
    searchToggleBtn.addEventListener('click', () => {
        searchBar.classList.toggle('open');
        if (searchBar.classList.contains('open')) searchInput.focus();
        else { searchInput.value = ''; renderAlbumsGrid(albums); }
    });
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (!query) renderAlbumsGrid(albums);
        else renderAlbumsGrid(albums.filter(a => a.title.toLowerCase().includes(query) || a.tracks.some(t => t.title.toLowerCase().includes(query))));
    });

    // Download Feature
    downloadAlbumBtn.addEventListener('click', async () => {
        if (!currentAlbum || typeof JSZip === 'undefined') return;
        const format = downloadFormatSelect.value;
        const zip = new JSZip();
        downloadProgress.classList.remove('hidden');
        downloadProgress.textContent = "Berechne...";
        
        try {
            // Find files of chosen format
            const urlsToDownload = currentAlbum.availableFiles.map(group => {
                let f = group.find(x => x.name.toLowerCase().endsWith(format));
                if (!f) f = group[0]; // fallback
                return { name: getBaseName(f.name).split('/').pop() + '.' + format, url: `${DOWNLOAD_URL}/${encodeIAUrl(f.name)}` };
            });

            downloadProgress.textContent = `Lade 0/${urlsToDownload.length} Dateien...`;
            
            for (let i = 0; i < urlsToDownload.length; i++) {
                const f = urlsToDownload[i];
                downloadProgress.textContent = `Lade ${i+1}/${urlsToDownload.length} (${f.name})...`;
                const res = await fetch(f.url);
                if (!res.ok) throw new Error("Download failed for " + f.name);
                const blob = await res.blob();
                zip.file(f.name, blob);
            }
            
            downloadProgress.textContent = "Erstelle ZIP...";
            const zipBlob = await zip.generateAsync({type: "blob"});
            saveAs(zipBlob, `${currentAlbum.title}.zip`);
            downloadProgress.textContent = "Fertig!";
            setTimeout(() => downloadProgress.classList.add('hidden'), 3000);
        } catch(e) {
            console.error(e);
            downloadProgress.textContent = "Fehler beim Download!";
            setTimeout(() => downloadProgress.classList.add('hidden'), 3000);
        }
    });

    function openAlbum(album) {
        currentAlbum = album;
        const coverContainer = document.getElementById('detail-cover');
        if (currentAlbum.coverUrl) {
            coverContainer.innerHTML = `<img src="${currentAlbum.coverUrl}" style="width:100%;height:100%;object-fit:cover;" class="skeleton" crossorigin="anonymous" onload="this.classList.remove('skeleton')">`;
            coverContainer.style.background = 'transparent';
            coverContainer.classList.remove('skeleton');
        } else {
            coverContainer.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:4rem;font-weight:900;color:rgba(255,255,255,0.3)">3</div>';
            coverContainer.style.background = currentAlbum.gradient;
        }

        document.getElementById('detail-title').textContent = currentAlbum.title;
        document.getElementById('detail-meta').textContent = currentAlbum.year ? `DR3iARCHiVE • ${currentAlbum.year}` : `DR3iARCHiVE`;
        
        document.getElementById('detail-description').textContent = currentAlbum.description;
        if (currentAlbum.duration) {
            const min = Math.round(currentAlbum.duration / 60000);
            document.getElementById('detail-duration').textContent = `Dauer: ${min} Min.`;
        } else {
            document.getElementById('detail-duration').textContent = "";
        }

        trackListEl.innerHTML = '';
        currentAlbum.tracks.forEach((track, idx) => {
            const li = document.createElement('li');
            li.className = 'track-item';
            li.setAttribute('data-id', track.url);
            li.innerHTML = `<div class="track-number">${idx + 1}</div><div class="track-info"><span class="track-title">${track.title}</span></div>`;
            li.addEventListener('click', () => playFromQueue(currentAlbum.tracks, idx));
            trackListEl.appendChild(li);
        });

        albumsView.classList.remove('active');
        albumDetailView.classList.add('active');
        backBtn.classList.remove('hidden');
        viewTitle.textContent = currentAlbum.title;
        updateActiveTrackUI();
    }

    backBtn.addEventListener('click', () => {
        albumDetailView.classList.remove('active');
        albumsView.classList.add('active');
        backBtn.classList.add('hidden');
        viewTitle.textContent = "DR3iARCHiVE";
        currentAlbum = null;
    });

    playAlbumBtn.addEventListener('click', () => {
        if (currentAlbum && currentAlbum.tracks.length > 0) playFromQueue(currentAlbum.tracks, 0);
    });

    // History
    function saveToHistory(track) {
        let history = JSON.parse(localStorage.getItem('dr3i-history') || '[]');
        history = history.filter(t => t.albumId !== track.albumId);
        history.unshift({ albumId: track.albumId, albumTitle: track.albumTitle, coverUrl: track.coverUrl, title: track.title, timestamp: Date.now() });
        if (history.length > 10) history.pop();
        localStorage.setItem('dr3i-history', JSON.stringify(history));
        renderHistory();
    }

    function renderHistory() {
        const history = JSON.parse(localStorage.getItem('dr3i-history') || '[]');
        if (history.length === 0) { historySection.classList.add('hidden'); return; }
        historySection.classList.remove('hidden');
        historyScroll.innerHTML = '';
        history.forEach(item => {
            const card = document.createElement('div');
            card.className = 'history-card';
            let coverHtml = item.coverUrl 
                ? `<img src="${item.coverUrl}" class="cover-image skeleton" onload="this.classList.remove('skeleton')" crossorigin="anonymous">`
                : `<div class="cover-placeholder" style="background: ${stringToGradient(item.albumTitle)}; font-size:2rem;">3</div>`;
            card.innerHTML = `<div class="history-cover">${coverHtml}</div><div class="history-title">${item.albumTitle}</div><div style="font-size:0.75rem; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</div>`;
            card.addEventListener('click', () => {
                const album = albums.find(a => a.id === item.albumId);
                if (album) {
                    openAlbum(album);
                    const trackIdx = album.tracks.findIndex(t => t.title === item.title);
                    if (trackIdx !== -1) playFromQueue(album.tracks, trackIdx);
                }
            });
            historyScroll.appendChild(card);
        });
    }

    // Gapless Engine & Playback
    function playFromQueue(queue, index) {
        playingQueue = queue;
        currentQueueIndex = index;
        
        activeAudio.src = playingQueue[currentQueueIndex].url;
        activeAudio.playbackRate = playbackSpeed;
        activeAudio.play().catch(e => console.error(e));
        
        preloadNext();
        updatePlayerState();
        saveToHistory(playingQueue[currentQueueIndex]);
    }

    function preloadNext() {
        if (currentQueueIndex + 1 < playingQueue.length) {
            nextAudio.src = playingQueue[currentQueueIndex + 1].url;
            nextAudio.load();
        } else nextAudio.removeAttribute('src');
    }

    function handleEnded() {
        if (currentQueueIndex + 1 < playingQueue.length) {
            currentQueueIndex++;
            let temp = activeAudio; activeAudio = nextAudio; nextAudio = temp;
            
            activeAudio.playbackRate = playbackSpeed;
            activeAudio.play().catch(e => console.error(e));
            
            preloadNext();
            updatePlayerState();
            saveToHistory(playingQueue[currentQueueIndex]);
        } else updatePlayPauseIcon(false);
    }

    audioA.addEventListener('ended', handleEnded);
    audioB.addEventListener('ended', handleEnded);
    audioA.addEventListener('play', () => updatePlayPauseIcon(true));
    audioA.addEventListener('pause', () => updatePlayPauseIcon(false));
    audioB.addEventListener('play', () => updatePlayPauseIcon(true));
    audioB.addEventListener('pause', () => updatePlayPauseIcon(false));

    function updatePlayPauseIcon(isPlaying) {
        if (isPlaying) { iconPlay.classList.add('hidden'); iconPause.classList.remove('hidden'); }
        else { iconPause.classList.add('hidden'); iconPlay.classList.remove('hidden'); }
    }

    function updatePlayerState() {
        if (currentQueueIndex < 0) return;
        const track = playingQueue[currentQueueIndex];
        
        document.getElementById('player-title').textContent = track.title;
        document.getElementById('player-artist').textContent = track.albumTitle;
        
        const playerCover = document.getElementById('player-cover');
        if (track.coverUrl) {
            playerCover.innerHTML = `<img src="${track.coverUrl}" style="width:100%;height:100%;object-fit:cover;" class="skeleton" onload="this.classList.remove('skeleton')" crossorigin="anonymous">`;
            playerCover.style.background = 'transparent';
        } else {
            playerCover.innerHTML = '';
            playerCover.style.background = stringToGradient(track.albumTitle);
        }
        
        updateActiveTrackUI();
        
        if ('mediaSession' in navigator) {
            let artwork = track.coverUrl ? [{ src: track.coverUrl, sizes: '512x512', type: 'image/png' }] : [];
            navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: 'DR3iARCHiVE', album: track.albumTitle, artwork: artwork });
            navigator.mediaSession.setActionHandler('previoustrack', playPrev);
            navigator.mediaSession.setActionHandler('nexttrack', playNext);
            navigator.mediaSession.setActionHandler('play', () => activeAudio.play());
            navigator.mediaSession.setActionHandler('pause', () => activeAudio.pause());
        }
    }

    function updateActiveTrackUI() {
        if (playingQueue.length === 0 || currentQueueIndex < 0) return;
        const activeUrl = playingQueue[currentQueueIndex].url;
        document.querySelectorAll('.track-item').forEach(el => {
            if (el.getAttribute('data-id') === activeUrl) el.classList.add('playing');
            else el.classList.remove('playing');
        });
    }

    function playPrev() { if (currentQueueIndex > 0) playFromQueue(playingQueue, currentQueueIndex - 1); }
    function playNext() { if (currentQueueIndex < playingQueue.length - 1) playFromQueue(playingQueue, currentQueueIndex + 1); }

    playPauseBtn.addEventListener('click', () => {
        if (activeAudio.paused && activeAudio.src) activeAudio.play();
        else activeAudio.pause();
    });
    prevBtn.addEventListener('click', playPrev);
    nextBtn.addEventListener('click', playNext);

    // Progress Bar Logic
    function updateProgress() {
        if (!activeAudio.src || isDraggingSlider) return;
        const curr = activeAudio.currentTime;
        const total = activeAudio.duration;
        if (!isNaN(total)) {
            const perc = (curr / total) * 100;
            progressSlider.value = perc;
            progressSlider.style.background = `linear-gradient(to right, var(--text-base) ${perc}%, rgba(255,255,255,0.2) ${perc}%)`;
            timeCurrent.textContent = formatTime(curr);
            timeTotal.textContent = formatTime(total);
        }
    }
    audioA.addEventListener('timeupdate', updateProgress);
    audioB.addEventListener('timeupdate', updateProgress);
    audioA.addEventListener('loadedmetadata', updateProgress);
    audioB.addEventListener('loadedmetadata', updateProgress);

    progressSlider.addEventListener('input', (e) => {
        isDraggingSlider = true;
        const val = e.target.value;
        e.target.style.background = `linear-gradient(to right, var(--accent) ${val}%, rgba(255,255,255,0.2) ${val}%)`;
    });
    progressSlider.addEventListener('change', (e) => {
        if (activeAudio.src && !isNaN(activeAudio.duration)) {
            activeAudio.currentTime = (e.target.value / 100) * activeAudio.duration;
        }
        isDraggingSlider = false;
    });

    speedBtn.addEventListener('click', () => {
        let idx = speedOptions.indexOf(playbackSpeed);
        idx = (idx + 1) % speedOptions.length;
        playbackSpeed = speedOptions[idx];
        speedBtn.textContent = playbackSpeed + 'x';
        activeAudio.playbackRate = playbackSpeed;
    });

    sleepBtn.addEventListener('click', () => sleepModal.classList.remove('hidden'));
    closeSleepModalBtn.addEventListener('click', () => sleepModal.classList.add('hidden'));

    document.querySelectorAll('.timer-options button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const minutes = parseInt(e.target.getAttribute('data-time'));
            clearTimeout(sleepTimer);
            if (minutes === 0) {
                sleepBadge.classList.add('hidden');
            } else {
                sleepBadge.textContent = minutes + 'm';
                sleepBadge.classList.remove('hidden');
                sleepTimer = setTimeout(() => {
                    activeAudio.pause();
                    sleepBadge.classList.add('hidden');
                }, minutes * 60 * 1000);
            }
            sleepModal.classList.add('hidden');
        });
    });
});
