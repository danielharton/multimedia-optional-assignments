'use strict';

(function () {
	const albumsRow = document.getElementById('albumsRow');
	const searchInput = document.getElementById('searchInput');
	const playOnSpotifyBtn = document.getElementById('playOnSpotifyBtn');
	const albumModalEl = document.getElementById('albumModal');
	const albumModal = new bootstrap.Modal(albumModalEl);
	const albumModalLabel = document.getElementById('albumModalLabel');
	const albumModalBody = albumModalEl.querySelector('.modal-body');
	const backToTopBtn = document.getElementById('backToTopBtn');

	
	let allAlbums = [];
	let currentList = [];
	let currentSort = null;

	function parseDurationToSeconds(duration) {
		if (!duration)
			 return 0;
		const parts = String(duration).split(':').map(Number);
		if (parts.length === 2) {
			const [m, s] = parts;
			return (isNaN(m) ? 0 : m) * 60 + (isNaN(s) ? 0 : s);
		}
		if (parts.length === 3) {
			const [h, m, s] = parts;
			return (isNaN(h) ? 0 : h) * 3600 + (isNaN(m) ? 0 : m) * 60 + (isNaN(s) ? 0 : s);
		}
		return 0;
	}

	function formatSeconds(totalSeconds) {
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		const mm = minutes.toString();
		const ss = seconds.toString().padStart(2, '0');
		return hours > 0 ? `${hours}:${mm.padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
	}

	function getAlbumStats(album) {
		const durations = album.tracklist.map(t => ({
			...t,
			seconds: parseDurationToSeconds(t.trackLength)
		}));
		const totalTracks = durations.length;
		const totalSeconds = durations.reduce((acc, t) => acc + t.seconds, 0);
		const avgSeconds = totalTracks ? Math.round(totalSeconds / totalTracks) : 0;
		const longest = durations.reduce((a, b) => (b.seconds > a.seconds ? b : a), durations[0]);
		const shortest = durations.reduce((a, b) => (b.seconds < a.seconds ? b : a), durations[0]);
		return {
			totalTracks,
			totalSeconds,
			avgSeconds,
			longest,
			shortest
		};
	}

	function buildCard(album) {
		return `
			<div class="col-xl-2 col-md-3 col-sm-6 col-12 mb-4">
				<div class="card h-100 shadow-sm">
					<div class="card-img-wrapper position-relative">
						<img src="assets/img/${album.thumbnail}" class="card-img-top" alt="${album.artist} - ${album.album}">
						<div class="album-overlay">
							<span class="small">${album.album}</span>
						</div>
					</div>
					<div class="card-body d-flex flex-column">
						<h5 class="card-title mb-1">${album.artist}</h5>
						<p class="card-text text-muted">${album.album}</p>
					</div>
					<div class="card-footer bg-transparent border-0 mt-auto">
						<button type="button" class="btn btn-primary w-100 btn-view" data-id="${album.id}">View Tracklist</button>
					</div>
				</div>
			</div>
		`;
	}

	function render(albums) {
		const html = albums.map(buildCard).join('');
		albumsRow.innerHTML = html;
	}

	function applyFilterAndSort() {
		const q = (searchInput.value || '').trim().toLowerCase();
		let list = !q
			? [...allAlbums]
			: allAlbums.filter(a =>
				(a.artist && a.artist.toLowerCase().includes(q)) ||
				(a.album && a.album.toLowerCase().includes(q))
			);

		if (currentSort === 'artist-asc') {
			list.sort((a, b) => a.artist.localeCompare(b.artist));
		} else if (currentSort === 'album-asc') {
			list.sort((a, b) => a.album.localeCompare(b.album));
		} else if (currentSort === 'tracks-asc') {
			list.sort((a, b) => a.tracklist.length - b.tracklist.length);
		} else if (currentSort === 'tracks-desc') {
			list.sort((a, b) => b.tracklist.length - a.tracklist.length);
		}

		currentList = list;
		render(currentList);
	}

	function openAlbumModal(album) {
		albumModalLabel.textContent = `${album.artist} - ${album.album}`;
		const stats = getAlbumStats(album);
		const statsHtml = `
			<div class="row g-2 mb-3">
				<div class="col-6 col-md-3"><div class="p-2 bg-light rounded text-center">Tracks: <strong>${stats.totalTracks}</strong></div></div>
				<div class="col-6 col-md-3"><div class="p-2 bg-light rounded text-center">Duration: <strong>${formatSeconds(stats.totalSeconds)}</strong></div></div>
				<div class="col-6 col-md-3"><div class="p-2 bg-light rounded text-center">Average: <strong>${formatSeconds(stats.avgSeconds)}</strong></div></div>
				<div class="col-6 col-md-3"><div class="p-2 bg-light rounded text-center">Longest: <strong>${stats.longest?.title || ''}</strong></div></div>
			</div>
		`;
		const tableRows = album.tracklist.map(t => `
			<tr>
				<td class="text-muted">${t.number}</td>
				<td><a href="${t.url}" target="_blank" rel="noopener" class="link-primary text-decoration-none">${t.title}</a></td>
				<td class="text-nowrap text-end">${t.trackLength}</td>
			</tr>
		`).join('');
		const tableHtml = `
			<div class="table-responsive">
				<table class="table table-hover align-middle mb-0">
					<thead>
						<tr>
							<th style="width:5rem;" scope="col">#</th>
							<th scope="col">Title</th>
							<th style="width:6rem;" class="text-end" scope="col">Length</th>
						</tr>
					</thead>
					<tbody>
						${tableRows}
					</tbody>
				</table>
			</div>
		`;
		albumModalBody.innerHTML = statsHtml + tableHtml;
		if (album.tracklist.length > 0) {
			playOnSpotifyBtn.href = album.tracklist[0].url;
			playOnSpotifyBtn.classList.remove('disabled');
		} else {
			playOnSpotifyBtn.href = '#';
			playOnSpotifyBtn.classList.add('disabled');
		}
		albumModal.show();
	}

	albumsRow.addEventListener('click', function (e) {
		const btn = e.target.closest('.btn-view');
		if (!btn) return;
		const id = Number(btn.getAttribute('data-id'));
		const album = allAlbums.find(a => a.id === id);
		if (album) openAlbumModal(album);
	});

	searchInput.addEventListener('input', applyFilterAndSort);

	document.addEventListener('click', function (e) {
		const item = e.target.closest('[data-sort]');
		if (!item) return;
		currentSort = item.getAttribute('data-sort');
		applyFilterAndSort();
	});

	window.addEventListener('scroll', function () {
		const shouldShow = window.scrollY > 300;
		backToTopBtn.style.display = shouldShow ? 'inline-flex' : 'none';
	});
	backToTopBtn.addEventListener('click', function () {
		window.scrollTo({ top: 0, behavior: 'smooth' });
	});

	fetch('./assets/data/library.json')
		.then(res => res.json())
		.then(data => {
			allAlbums = Array.isArray(data) ? data : [];
			applyFilterAndSort();
		})
		.catch(err => {
			console.error('Failed to load library.json. Try running "npx http-server" from the "3" root directory.', err);
			albumsRow.innerHTML = '<div class="col-12"><div class="alert alert-danger">Failed to load albums.  Try running "npx http-server" from the "3" root directory</div></div>';
		});
})();


