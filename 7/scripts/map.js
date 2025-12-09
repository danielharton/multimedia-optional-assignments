(function () {
    const statusEl = document.getElementById('status');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const markerSelect = document.getElementById('marker-select');
    const addMarkerBtn = document.getElementById('add-marker-btn');
    const measureBtn = document.getElementById('measure-btn');
    const distanceOutput = document.getElementById('distance-output');
    const routeToggleBtn = document.getElementById('route-toggle-btn');
    const routeClearBtn = document.getElementById('route-clear-btn');
    const routeDistanceEl = document.getElementById('route-distance');
    const nearbyRadiusInput = document.getElementById('nearby-radius');
    const refreshNearbyBtn = document.getElementById('refresh-nearby-btn');

    let map;
    let layerControl;
    let userLatLng;
    let userMarker;
    let accuracyCircle;
    let measurementLine;
    let clickMode = null;
    let routeActive = false;
    let routePoints = [];
    let routeLine;
    let routeMarkers = [];
    const categoryLayers = {};
    const overlays = {
        'Custom markers': L.layerGroup(),
        'Nearby places': L.layerGroup(),
        'Routes': L.layerGroup(),
        'Geofences': L.layerGroup()
    };

    const iconBase = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/';
    const shadowUrl = `${iconBase}marker-shadow.png`;
    const icons = {
        default: L.icon({ iconUrl: `${iconBase}marker-icon-blue.png`, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] }),
        home: L.icon({ iconUrl: `${iconBase}marker-icon-green.png`, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] }),
        work: L.icon({ iconUrl: `${iconBase}marker-icon-blue.png`, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] }),
        favorite: L.icon({ iconUrl: `${iconBase}marker-icon-violet.png`, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] }),
        food: L.icon({ iconUrl: `${iconBase}marker-icon-orange.png`, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] })
    };

    const places = [
        { name: 'Central Park', coords: [40.7829, -73.9654], address: 'New York, NY', category: 'park', description: 'Large urban park with trails and lakes.' },
        { name: 'Museum of Modern Art', coords: [40.7614, -73.9776], address: '11 W 53rd St, New York, NY', category: 'museum', description: 'Modern art exhibits and installations.' },
        { name: 'Brooklyn Bridge Park', coords: [40.7003, -73.9967], address: '334 Furman St, Brooklyn, NY', category: 'park', description: 'Waterfront park with skyline views.' },
        { name: 'Joe’s Coffee', coords: [40.7306, -73.9866], address: '141 Waverly Pl, New York, NY', category: 'cafe', description: 'Cozy coffee shop with outdoor seating.' },
        { name: 'Best Pizza', coords: [40.7146, -73.9570], address: '33 Havemeyer St, Brooklyn, NY', category: 'restaurant', description: 'Brick-oven pizza and casual vibe.' },
        { name: 'High Line', coords: [40.7479, -74.0049], address: 'New York, NY', category: 'park', description: 'Elevated linear park with city views.' },
        { name: 'Book Nook', coords: [40.7420, -73.9897], address: 'Chelsea, NY', category: 'shop', description: 'Independent bookstore with local authors.' }
    ];

    const geofences = [
        { name: 'Midtown Zone', coords: [40.7580, -73.9855], radius: 600 },
        { name: 'Brooklyn Zone', coords: [40.7010, -73.9900], radius: 800 }
    ];
    const geofenceState = new Map();

    function setStatus(message, isError = false) {
        statusEl.textContent = message;
        statusEl.style.background = isError ? '#fdecea' : '#eef3ff';
        statusEl.style.color = isError ? '#8a1c1c' : '#1c3f8f';
    }

    function createBaseLayers() {
        return {
            'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors'
            }),
            'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Tiles &copy; Esri'
            }),
            'Terrain': L.tileLayer('https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg', {
                maxZoom: 18,
                attribution: 'Map tiles by Stamen Design'
            }),
            'Dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                attribution: '&copy; CartoDB'
            }),
            'Topographic': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                maxZoom: 17,
                attribution: 'Map data: &copy; OpenTopoMap contributors'
            })
        };
    }

    function ensureCategoryLayer(category) {
        if (!categoryLayers[category]) {
            const layer = L.layerGroup();
            categoryLayers[category] = layer;
            const label = `Places: ${category}`;
            overlays[label] = layer;
            if (map) {
                layer.addTo(map);
            }
            if (layerControl) {
                layerControl.addOverlay(layer, label);
            }
        }
        return categoryLayers[category];
    }

    function initMap(lat, lng) {
        const baseLayers = createBaseLayers();
        map = L.map('map', {
            center: [lat, lng],
            zoom: 15,
            layers: [baseLayers['OpenStreetMap']]
        });

        Object.values(overlays).forEach(layer => layer.addTo(map));
        layerControl = L.control.layers(baseLayers, overlays).addTo(map);

        map.on('click', handleMapClick);
        drawGeofences();
        renderPlaces();
        updateNearbyPlaces();
        setStatus('Location acquired. Ready to explore!');
    }

    function drawGeofences() {
        const group = overlays['Geofences'];
        geofences.forEach(fence => {
            const circle = L.circle(fence.coords, {
                radius: fence.radius,
                color: '#9b51e0',
                fillColor: '#9b51e0',
                fillOpacity: 0.15,
                weight: 2
            }).addTo(group);
            circle.bindTooltip(`${fence.name} (${Math.round(fence.radius)} m)`, { sticky: true });
            fence.circle = circle;
            geofenceState.set(fence.name, false);
        });
    }

    function renderPlaces() {
        places.forEach(place => {
            const iconKey = getIconKeyForCategory(place.category);
            const marker = L.marker(place.coords, { icon: icons[iconKey] || icons.default });
            const popupContent = `<strong>${place.name}</strong><br>${place.address}<br>${place.description}`;
            marker.bindPopup(popupContent);
            const layer = ensureCategoryLayer(place.category);
            marker.addTo(layer);
            place.marker = marker;
        });
    }

    function getIconKeyForCategory(category) {
        const map = {
            park: 'favorite',
            museum: 'work',
            cafe: 'food',
            restaurant: 'food',
            shop: 'work'
        };
        return map[category] || 'default';
    }

    function updateUserLocation(lat, lng, accuracy) {
        userLatLng = L.latLng(lat, lng);
        if (!userMarker) {
            userMarker = L.marker(userLatLng, { icon: icons.default }).addTo(map);
            userMarker.bindPopup('You are here');
        } else {
            userMarker.setLatLng(userLatLng);
        }

        if (!accuracyCircle) {
            accuracyCircle = L.circle(userLatLng, {
                color: 'green',
                fillColor: 'rgba(62, 240, 62, 1)',
                fillOpacity: 0.3,
                radius: accuracy
            }).addTo(map);
        } else {
            accuracyCircle.setLatLng(userLatLng);
            accuracyCircle.setRadius(accuracy);
        }
    }

    function handleMapClick(e) {
        if (clickMode === 'addMarker') {
            placeCustomMarker(e.latlng);
            clickMode = null;
            addMarkerBtn.disabled = false;
            return;
        }

        if (clickMode === 'measure') {
            measureToPoint(e.latlng);
            clickMode = null;
            measureBtn.disabled = false;
            return;
        }

        if (routeActive) {
            addRoutePoint(e.latlng);
        }
    }

    function placeCustomMarker(latlng) {
        const type = markerSelect.value;
        const icon = icons[type] || icons.default;
        const marker = L.marker(latlng, { icon });
        marker.bindPopup(`<strong>${type} marker</strong><br>${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`);
        marker.addTo(overlays['Custom markers']);
        setStatus(`Placed a ${type} marker.`);
    }

    function measureToPoint(latlng) {
        if (!userLatLng) {
            setStatus('User location not available yet.', true);
            return;
        }
        const meters = userLatLng.distanceTo(latlng);
        const km = meters / 1000;
        const miles = meters / 1609.34;
        distanceOutput.textContent = `${meters.toFixed(0)} m | ${km.toFixed(2)} km | ${miles.toFixed(2)} mi`;

        if (measurementLine) {
            measurementLine.remove();
        }
        measurementLine = L.polyline([userLatLng, latlng], { color: '#9b51e0', dashArray: '6 6' }).addTo(map);
        L.popup().setLatLng(latlng).setContent(distanceOutput.textContent).openOn(map);
    }

    function toggleRoute() {
        routeActive = !routeActive;
        routeToggleBtn.textContent = routeActive ? 'Stop route' : 'Start route';
        if (routeActive) {
            setStatus('Route mode: click on the map to add points.');
        }
    }

    function addRoutePoint(latlng) {
        routePoints.push(latlng);
        const marker = L.circleMarker(latlng, { radius: 6, color: '#2f80ed', weight: 2 }).addTo(overlays['Routes']);
        routeMarkers.push(marker);
        redrawRoute();
    }

    function redrawRoute() {
        if (routeLine) {
            routeLine.remove();
        }
        if (routePoints.length >= 2) {
            routeLine = L.polyline(routePoints, { color: '#eb5757', weight: 3 }).addTo(overlays['Routes']);
        }
        const distance = calculateRouteDistance();
        routeDistanceEl.textContent = `Route length: ${distance.toFixed(0)} m (${(distance / 1000).toFixed(2)} km)`;
    }

    function calculateRouteDistance() {
        let total = 0;
        for (let i = 1; i < routePoints.length; i++) {
            total += routePoints[i - 1].distanceTo(routePoints[i]);
        }
        return total;
    }

    function clearRoute() {
        routePoints = [];
        routeMarkers.forEach(m => m.remove());
        routeMarkers = [];
        if (routeLine) {
            routeLine.remove();
            routeLine = null;
        }
        routeDistanceEl.textContent = 'Route length: 0 m';
        setStatus('Route cleared.');
    }

    function updateNearbyPlaces() {
        const radiusKm = parseFloat(nearbyRadiusInput.value) || 2;
        const radiusMeters = radiusKm * 1000;
        const group = overlays['Nearby places'];
        group.clearLayers();
        if (!userLatLng) return;

        const nearby = places.filter(place => L.latLng(place.coords).distanceTo(userLatLng) <= radiusMeters);
        nearby.forEach(place => {
            const marker = L.circleMarker(place.coords, {
                radius: 8,
                color: '#27ae60',
                fillColor: '#27ae60',
                fillOpacity: 0.6
            }).addTo(group);
            marker.bindPopup(`<strong>${place.name}</strong><br>${place.address}<br>Within ${radiusKm} km`);
        });
        setStatus(`Found ${nearby.length} nearby place(s) within ${radiusKm} km.`);
    }

    function checkGeofences(latlng) {
        geofences.forEach(fence => {
            const inside = latlng.distanceTo(fence.coords) <= fence.radius;
            const wasInside = geofenceState.get(fence.name);
            if (inside && !wasInside) {
                setStatus(`Entered geofence: ${fence.name}`);
            } else if (!inside && wasInside) {
                setStatus(`Exited geofence: ${fence.name}`);
            }
            geofenceState.set(fence.name, inside);
        });
    }

    function handleSearch() {
        const query = searchInput.value.trim().toLowerCase();
        if (!query) {
            setStatus('Type a place name to search.', true);
            return;
        }
        const match = places.find(p => p.name.toLowerCase().includes(query));
        if (!match) {
            setStatus('No matching place found.', true);
            return;
        }
        map.flyTo(match.coords, 16);
        if (match.marker) {
            match.marker.openPopup();
        }
        setStatus(`Moved to ${match.name}`);
    }

    function attachUIEvents() {
        searchBtn.addEventListener('click', handleSearch);
        addMarkerBtn.addEventListener('click', () => {
            clickMode = 'addMarker';
            addMarkerBtn.disabled = true;
            setStatus('Click on the map to place the marker.');
        });
        measureBtn.addEventListener('click', () => {
            clickMode = 'measure';
            measureBtn.disabled = true;
            setStatus('Click on the map to measure distance.');
        });
        routeToggleBtn.addEventListener('click', toggleRoute);
        routeClearBtn.addEventListener('click', clearRoute);
        refreshNearbyBtn.addEventListener('click', updateNearbyPlaces);
    }

    function startGeolocation() {
        if (!navigator.geolocation) {
            setStatus('Geolocation is not supported by this browser.', true);
            fallbackMap();
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                initMap(latitude, longitude);
                updateUserLocation(latitude, longitude, accuracy);
                updateNearbyPlaces();
            },
            handleGeoError,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );

        navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                if (!map) {
                    initMap(latitude, longitude);
                }
                updateUserLocation(latitude, longitude, accuracy);
                checkGeofences(L.latLng(latitude, longitude));
            },
            handleGeoError,
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );
    }

    function handleGeoError(error) {
        const messages = {
            1: 'Permission denied. Please allow location access.',
            2: 'Position unavailable. Try again.',
            3: 'Geolocation timeout. Please retry.'
        };
        setStatus(messages[error.code] || 'Geolocation error occurred.', true);
        if (!map) {
            fallbackMap();
        }
    }

    function fallbackMap() {
        const fallback = { lat: 40.7128, lng: -74.0060 };
        initMap(fallback.lat, fallback.lng);
        setStatus('Showing fallback location (New York City).', true);
    }

    window.addEventListener('load', () => {
        attachUIEvents();
        startGeolocation();
    });
})(); 