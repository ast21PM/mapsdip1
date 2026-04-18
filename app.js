(function () {
  const STORAGE_KEY = "erls-map-state-v1";
  const DEFAULT_VIEW = {
    center: [52.95954, 36.06142],
    zoom: 17,
  };

  const state = {
    mode: "measure",
    tx: null,
    points: [],
    selectedId: null,
    mapView: { ...DEFAULT_VIEW },
    lastKnownPosition: null,
  };

  const elements = {
    rssiInput: document.getElementById("rssiInput"),
    snrInput: document.getElementById("snrInput"),
    noteInput: document.getElementById("noteInput"),
    txModeBtn: document.getElementById("txModeBtn"),
    measureModeBtn: document.getElementById("measureModeBtn"),
    myLocationBtn: document.getElementById("myLocationBtn"),
    savePointBtn: document.getElementById("savePointBtn"),
    deselectBtn: document.getElementById("deselectBtn"),
    clearBtn: document.getElementById("clearBtn"),
    exportCsvBtn: document.getElementById("exportCsvBtn"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    importJsonBtn: document.getElementById("importJsonBtn"),
    importInput: document.getElementById("importInput"),
    printBtn: document.getElementById("printBtn"),
    centerInstituteBtn: document.getElementById("centerInstituteBtn"),
    presentationModeBtn: document.getElementById("presentationModeBtn"),
    modeBadge: document.getElementById("modeBadge"),
    txBadge: document.getElementById("txBadge"),
    countBadge: document.getElementById("countBadge"),
    maxDistanceBadge: document.getElementById("maxDistanceBadge"),
    avgRssiBadge: document.getElementById("avgRssiBadge"),
    pointsTableBody: document.getElementById("pointsTableBody"),
    selectionEmpty: document.getElementById("selectionEmpty"),
    selectionDetails: document.getElementById("selectionDetails"),
    selectedIndex: document.getElementById("selectedIndex"),
    selectedQuality: document.getElementById("selectedQuality"),
    selectedDistance: document.getElementById("selectedDistance"),
    selectedCoords: document.getElementById("selectedCoords"),
    bestRssiStat: document.getElementById("bestRssiStat"),
    worstRssiStat: document.getElementById("worstRssiStat"),
    bestSnrStat: document.getElementById("bestSnrStat"),
  };

  loadState();

  const map = L.map("map", {
    zoomControl: false,
    preferCanvas: true,
  }).setView(state.mapView.center, state.mapView.zoom);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    crossOrigin: true,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
  }).addTo(map);

  const lineLayer = L.layerGroup().addTo(map);
  const markerLayer = L.layerGroup().addTo(map);
  const helperLayer = L.layerGroup().addTo(map);

  bindEvents();
  setMode(state.mode);
  hydrateInputsFromSelection();
  renderAll();

  function bindEvents() {
    elements.txModeBtn.addEventListener("click", function () {
      setMode("tx");
    });

    elements.measureModeBtn.addEventListener("click", function () {
      setMode("measure");
    });

    elements.myLocationBtn.addEventListener("click", function () {
      centerOnCurrentLocation();
    });

    elements.centerInstituteBtn.addEventListener("click", function () {
      map.flyTo(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom, { duration: 0.8 });
    });

    elements.savePointBtn.addEventListener("click", function () {
      updateSelectedPoint();
    });

    elements.deselectBtn.addEventListener("click", function () {
      state.selectedId = null;
      renderAll();
      saveState();
    });

    elements.clearBtn.addEventListener("click", function () {
      clearAll();
    });

    elements.exportCsvBtn.addEventListener("click", exportCsv);
    elements.exportJsonBtn.addEventListener("click", exportJson);
    elements.importJsonBtn.addEventListener("click", function () {
      elements.importInput.click();
    });
    elements.importInput.addEventListener("change", importJson);
    elements.printBtn.addEventListener("click", function () {
      window.print();
    });
    elements.presentationModeBtn.addEventListener("click", togglePresentationMode);

    map.on("click", function (event) {
      if (state.mode === "tx") {
        state.tx = normalizeLatLng(event.latlng);
        state.selectedId = null;
        setMode("measure");
      } else {
        addMeasurementPoint(event.latlng);
      }

      renderAll();
      saveState();
    });

    map.on("moveend zoomend", function () {
      const center = map.getCenter();
      state.mapView = {
        center: [round(center.lat, 6), round(center.lng, 6)],
        zoom: map.getZoom(),
      };
      saveState();
    });

    elements.pointsTableBody.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-action]");
      const row = event.target.closest("tr[data-id]");

      if (!row) {
        return;
      }

      const id = row.dataset.id;

      if (!button) {
        selectPoint(id, true);
        return;
      }

      if (button.dataset.action === "select") {
        selectPoint(id, true);
      }

      if (button.dataset.action === "delete") {
        deletePoint(id);
      }
    });

    window.addEventListener("afterprint", function () {
      setTimeout(function () {
        map.invalidateSize();
      }, 100);
    });
  }

  function setMode(mode) {
    state.mode = mode;
    elements.txModeBtn.classList.toggle("active", mode === "tx");
    elements.measureModeBtn.classList.toggle("active", mode === "measure");
    elements.modeBadge.textContent =
      mode === "tx" ? "Режим: позиция TX" : "Режим: точка замера";
    saveState();
  }

  function addMeasurementPoint(latlng) {
    const rssi = parseFloat(elements.rssiInput.value);
    const snr = parseFloat(elements.snrInput.value);
    const note = elements.noteInput.value.trim();

    if (Number.isNaN(rssi) || Number.isNaN(snr)) {
      window.alert("Заполни корректные значения RSSI и SNR.");
      return;
    }

    const point = {
      id: createId(),
      lat: round(latlng.lat, 6),
      lng: round(latlng.lng, 6),
      rssi: round(rssi, 1),
      snr: round(snr, 1),
      note: note,
      createdAt: new Date().toISOString(),
    };

    state.points.push(point);
    state.selectedId = point.id;
  }

  function updateSelectedPoint() {
    const point = getSelectedPoint();

    if (!point) {
      return;
    }

    const rssi = parseFloat(elements.rssiInput.value);
    const snr = parseFloat(elements.snrInput.value);

    if (Number.isNaN(rssi) || Number.isNaN(snr)) {
      window.alert("Заполни корректные значения RSSI и SNR.");
      return;
    }

    point.rssi = round(rssi, 1);
    point.snr = round(snr, 1);
    point.note = elements.noteInput.value.trim();

    renderAll();
    saveState();
  }

  function deletePoint(id) {
    const point = state.points.find(function (item) {
      return item.id === id;
    });

    if (!point) {
      return;
    }

    const ok = window.confirm(
      "Удалить точку " + getPointIndex(id) + " из журнала замеров?"
    );

    if (!ok) {
      return;
    }

    state.points = state.points.filter(function (item) {
      return item.id !== id;
    });

    if (state.selectedId === id) {
      state.selectedId = null;
    }

    renderAll();
    saveState();
  }

  function clearAll() {
    const ok = window.confirm(
      "Очистить TX, все точки и сохранённую локально сессию?"
    );

    if (!ok) {
      return;
    }

    state.tx = null;
    state.points = [];
    state.selectedId = null;
    state.lastKnownPosition = null;
    helperLayer.clearLayers();
    localStorage.removeItem(STORAGE_KEY);
    renderAll();
  }

  function selectPoint(id, flyToPoint) {
    state.selectedId = id;
    const point = getSelectedPoint();

    if (!point) {
      renderAll();
      saveState();
      return;
    }

    elements.rssiInput.value = point.rssi;
    elements.snrInput.value = point.snr;
    elements.noteInput.value = point.note;

    if (flyToPoint) {
      map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 18), {
        duration: 0.7,
      });
    }

    renderAll();
    saveState();
  }

  function renderAll() {
    renderMarkers();
    renderTable();
    renderSelection();
    renderStats();
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    lineLayer.clearLayers();
    helperLayer.clearLayers();

    if (state.lastKnownPosition) {
      L.circleMarker(state.lastKnownPosition, {
        radius: 7,
        color: "#0a6dff",
        weight: 2,
        fillColor: "#55a8ff",
        fillOpacity: 0.7,
        interactive: false,
      })
        .addTo(helperLayer)
        .bindTooltip("Моя позиция", {
          direction: "top",
          offset: [0, -6],
          className: "point-tooltip",
        });
    }

    if (state.tx) {
      const txMarker = L.circleMarker(state.tx, {
        radius: 11,
        color: "#ffffff",
        weight: 3,
        fillColor: "#5963f2",
        fillOpacity: 1,
        bubblingMouseEvents: false,
      }).addTo(markerLayer);

      txMarker
        .bindTooltip("TX", {
          permanent: true,
          direction: "top",
          offset: [0, -10],
          className: "point-tooltip",
        })
        .bindPopup(
          "<strong>Передатчик</strong><br>" +
            "Координаты: " +
            state.tx.lat.toFixed(6) +
            ", " +
            state.tx.lng.toFixed(6)
        );
    }

    state.points.forEach(function (point, index) {
      const quality = getQuality(point.rssi);
      const selected = point.id === state.selectedId;
      const latLng = [point.lat, point.lng];

      if (state.tx) {
        L.polyline([state.tx, latLng], {
          color: selected ? "#2339c5" : quality.stroke,
          weight: selected ? 4 : 3,
          opacity: selected ? 0.7 : 0.35,
          dashArray: "7 7",
          interactive: false,
        }).addTo(lineLayer);
      }

      const marker = L.circleMarker(latLng, {
        radius: selected ? 10 : 8,
        color: selected ? "#1b2430" : quality.stroke,
        weight: selected ? 3 : 2,
        fillColor: quality.fill,
        fillOpacity: 0.92,
        bubblingMouseEvents: false,
      }).addTo(markerLayer);

      marker
        .bindTooltip(String(index + 1), {
          permanent: true,
          direction: "top",
          offset: [0, -10],
          className: "point-tooltip",
        })
        .bindPopup(buildPopup(point, index + 1, quality.label));

      marker.on("click", function () {
        selectPoint(point.id, false);
      });
    });
  }

  function renderTable() {
    if (!state.points.length) {
      elements.pointsTableBody.innerHTML =
        '<tr><td colspan="8">Пока нет точек. Поставь TX и начни отмечать замеры на карте.</td></tr>';
      return;
    }

    const rows = state.points
      .map(function (point, index) {
        const quality = getQuality(point.rssi);
        const distance = getDistanceFromTx(point);
        const selectedClass = point.id === state.selectedId ? "selected-row" : "";

        return (
          '<tr class="' +
          selectedClass +
          '" data-id="' +
          point.id +
          '">' +
          "<td>" +
          (index + 1) +
          "</td>" +
          "<td>" +
          point.rssi.toFixed(1) +
          "</td>" +
          "<td>" +
          point.snr.toFixed(1) +
          "</td>" +
          "<td>" +
          (distance === null ? "—" : distance.toFixed(1)) +
          "</td>" +
          '<td><span class="quality-pill ' +
          quality.className +
          '">' +
          quality.label +
          "</span></td>" +
          "<td>" +
          escapeHtml(point.note || "—") +
          "</td>" +
          "<td>" +
          point.lat.toFixed(6) +
          ", " +
          point.lng.toFixed(6) +
          "</td>" +
          '<td><div class="table-actions">' +
          '<button class="table-btn" data-action="select">Выбрать</button>' +
          '<button class="table-btn delete" data-action="delete">Удалить</button>' +
          "</div></td>" +
          "</tr>"
        );
      })
      .join("");

    elements.pointsTableBody.innerHTML = rows;
  }

  function renderSelection() {
    const point = getSelectedPoint();

    elements.selectionEmpty.hidden = Boolean(point);
    elements.selectionDetails.hidden = !point;
    elements.savePointBtn.disabled = !point;
    elements.deselectBtn.disabled = !point;

    if (!point) {
      return;
    }

    const quality = getQuality(point.rssi);
    const distance = getDistanceFromTx(point);

    elements.selectedIndex.textContent = String(getPointIndex(point.id));
    elements.selectedQuality.textContent = quality.label;
    elements.selectedDistance.textContent =
      distance === null ? "—" : distance.toFixed(1) + " м";
    elements.selectedCoords.textContent =
      point.lat.toFixed(6) + ", " + point.lng.toFixed(6);
  }

  function hydrateInputsFromSelection() {
    const point = getSelectedPoint();

    if (!point) {
      return;
    }

    elements.rssiInput.value = point.rssi;
    elements.snrInput.value = point.snr;
    elements.noteInput.value = point.note;
  }

  function renderStats() {
    const count = state.points.length;
    const avgRssi =
      count === 0
        ? null
        : state.points.reduce(function (sum, point) {
            return sum + point.rssi;
          }, 0) / count;
    const maxDistance = state.points.reduce(function (max, point) {
      const distance = getDistanceFromTx(point);
      if (distance === null) {
        return max;
      }

      return Math.max(max, distance);
    }, 0);
    const bestRssi = count
      ? Math.max.apply(
          null,
          state.points.map(function (point) {
            return point.rssi;
          })
        )
      : null;
    const worstRssi = count
      ? Math.min.apply(
          null,
          state.points.map(function (point) {
            return point.rssi;
          })
        )
      : null;
    const bestSnr = count
      ? Math.max.apply(
          null,
          state.points.map(function (point) {
            return point.snr;
          })
        )
      : null;

    elements.txBadge.textContent = state.tx
      ? "TX: " + state.tx.lat.toFixed(5) + ", " + state.tx.lng.toFixed(5)
      : "TX не установлен";
    elements.countBadge.textContent = "Точек: " + count;
    elements.maxDistanceBadge.textContent =
      maxDistance > 0 ? "Макс. дальность: " + maxDistance.toFixed(1) + " м" : "Макс. дальность: —";
    elements.avgRssiBadge.textContent =
      avgRssi === null ? "Средний RSSI: —" : "Средний RSSI: " + avgRssi.toFixed(1) + " dBm";
    elements.bestRssiStat.textContent =
      bestRssi === null ? "—" : bestRssi.toFixed(1) + " dBm";
    elements.worstRssiStat.textContent =
      worstRssi === null ? "—" : worstRssi.toFixed(1) + " dBm";
    elements.bestSnrStat.textContent =
      bestSnr === null ? "—" : bestSnr.toFixed(1) + " dB";
  }

  function exportCsv() {
    const lines = [
      [
        "index",
        "type",
        "lat",
        "lng",
        "rssi_dbm",
        "snr_db",
        "distance_m",
        "quality",
        "note",
      ].join(","),
    ];

    if (state.tx) {
      lines.push(
        [
          "0",
          "TX",
          state.tx.lat,
          state.tx.lng,
          "",
          "",
          "",
          "TX",
          "",
        ].join(",")
      );
    }

    state.points.forEach(function (point, index) {
      const distance = getDistanceFromTx(point);
      const quality = getQuality(point.rssi);
      lines.push(
        [
          index + 1,
          "MEASURE",
          point.lat,
          point.lng,
          point.rssi,
          point.snr,
          distance === null ? "" : round(distance, 1),
          quality.label,
          csvEscape(point.note),
        ].join(",")
      );
    });

    downloadTextFile(lines.join("\n"), "erls-map-points.csv", "text/csv;charset=utf-8;");
  }

  function exportJson() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      mapView: state.mapView,
      tx: state.tx,
      points: state.points,
    };

    downloadTextFile(
      JSON.stringify(payload, null, 2),
      "erls-map-points.json",
      "application/json;charset=utf-8;"
    );
  }

  function importJson(event) {
    const file = event.target.files && event.target.files[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(reader.result);
        state.tx = data.tx ? normalizeLatLng(data.tx) : null;
        state.points = Array.isArray(data.points)
          ? data.points.map(function (point) {
              return {
                id: point.id || createId(),
                lat: round(point.lat, 6),
                lng: round(point.lng, 6),
                rssi: round(Number(point.rssi), 1),
                snr: round(Number(point.snr), 1),
                note: point.note || "",
                createdAt: point.createdAt || new Date().toISOString(),
              };
            })
          : [];
        state.mapView = data.mapView || { ...DEFAULT_VIEW };
        state.selectedId = null;

        map.setView(state.mapView.center, state.mapView.zoom);
        renderAll();
        saveState();
      } catch (error) {
        window.alert("Не удалось импортировать JSON. Проверь файл.");
      } finally {
        elements.importInput.value = "";
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function centerOnCurrentLocation() {
    if (!navigator.geolocation) {
      window.alert("В этом браузере недоступна геолокация.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (position) {
        state.lastKnownPosition = [
          round(position.coords.latitude, 6),
          round(position.coords.longitude, 6),
        ];
        map.flyTo(state.lastKnownPosition, 18, { duration: 0.8 });
        renderMarkers();
        saveState();
      },
      function () {
        window.alert(
          "Не удалось получить геопозицию. Можно просто вручную переместить карту."
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 12000,
      }
    );
  }

  function togglePresentationMode() {
    const body = document.body;
    body.classList.toggle("presentation-mode");
    elements.presentationModeBtn.textContent = body.classList.contains("presentation-mode")
      ? "Обычный режим"
      : "Скрин-режим";

    setTimeout(function () {
      map.invalidateSize();
    }, 120);
  }

  function getSelectedPoint() {
    return state.points.find(function (point) {
      return point.id === state.selectedId;
    });
  }

  function getPointIndex(id) {
    const index = state.points.findIndex(function (point) {
      return point.id === id;
    });
    return index >= 0 ? index + 1 : 0;
  }

  function getDistanceFromTx(point) {
    if (!state.tx) {
      return null;
    }

    return map.distance(state.tx, [point.lat, point.lng]);
  }

  function getQuality(rssi) {
    if (rssi > -70) {
      return {
        label: "Отлично",
        className: "excellent",
        fill: "#5bb97f",
        stroke: "#39875a",
      };
    }

    if (rssi > -85) {
      return {
        label: "Хорошо",
        className: "good",
        fill: "#8cbf45",
        stroke: "#658a26",
      };
    }

    if (rssi > -100) {
      return {
        label: "Норм",
        className: "normal",
        fill: "#e2a33f",
        stroke: "#ad7320",
      };
    }

    return {
      label: "Слабо",
      className: "weak",
      fill: "#df5353",
      stroke: "#aa2f2f",
    };
  }

  function buildPopup(point, number, qualityLabel) {
    const distance = getDistanceFromTx(point);
    const note = point.note ? "<br>Заметка: " + escapeHtml(point.note) : "";

    return (
      "<strong>Точка " +
      number +
      "</strong><br>" +
      "RSSI: " +
      point.rssi.toFixed(1) +
      " dBm<br>" +
      "SNR: " +
      point.snr.toFixed(1) +
      " dB<br>" +
      "Качество: " +
      qualityLabel +
      "<br>" +
      "Расстояние: " +
      (distance === null ? "—" : distance.toFixed(1) + " м") +
      note
    );
  }

  function saveState() {
    const payload = {
      mode: state.mode,
      tx: state.tx,
      points: state.points,
      selectedId: state.selectedId,
      mapView: state.mapView,
      lastKnownPosition: state.lastKnownPosition,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return;
    }

    try {
      const data = JSON.parse(raw);
      state.mode = data.mode === "tx" ? "tx" : "measure";
      state.tx = data.tx ? normalizeLatLng(data.tx) : null;
      state.points = Array.isArray(data.points)
        ? data.points.map(function (point) {
            return {
              id: point.id || createId(),
              lat: round(Number(point.lat), 6),
              lng: round(Number(point.lng), 6),
              rssi: round(Number(point.rssi), 1),
              snr: round(Number(point.snr), 1),
              note: point.note || "",
              createdAt: point.createdAt || new Date().toISOString(),
            };
          })
        : [];
      state.selectedId = data.selectedId || null;
      state.mapView = data.mapView || { ...DEFAULT_VIEW };
      state.lastKnownPosition = data.lastKnownPosition || null;
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function downloadTextFile(text, filename, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 500);
  }

  function csvEscape(value) {
    const text = String(value || "");
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function normalizeLatLng(value) {
    if (Array.isArray(value)) {
      return [round(Number(value[0]), 6), round(Number(value[1]), 6)];
    }

    return {
      lat: round(Number(value.lat), 6),
      lng: round(Number(value.lng), 6),
    };
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return "p-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function round(value, digits) {
    const factor = Math.pow(10, digits);
    return Math.round(Number(value) * factor) / factor;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
