// modules/zoomControl.js

/**
 * Optimized Zoom Control with Ratio-Based Anchoring and CSS Scaling.
 */
export function initZoomControls(ws, container, duration, applyZoomCallback,
                                wrapperElement, onBeforeZoom = null,
                                onAfterZoom = null, isSelectionExpandMode = () => false,
                                onCtrlArrowUp = null) {
  const zoomInBtn = document.getElementById('zoom-in');
  const zoomOutBtn = document.getElementById('zoom-out');
  const expandBtn = document.getElementById('expand-btn');

  // Internal State
  let zoomLevel = 500;
  let minZoomLevel = 250;
  
  // Timer for Debounce (Performance optimization)
  let wheelTimeout = null;
  // Flag to indicate if we are currently manipulating CSS only
  let isWheelZooming = false;

  // [CRITICAL] Inject CSS to ensure Canvas stretches visually (GPU)
  function _injectCssForSmoothing() {
    const styleId = 'spectrogram-smooth-zoom-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      // Force the canvas to fill the container so CSS width changes stretch the image
      style.textContent = `
        #spectrogram-only canvas {
          width: 100% !important;
          height: 100% !important;
          image-rendering: auto; /* Smoother interpolation */
        }
      `;
      document.head.appendChild(style);
    }
  }
  _injectCssForSmoothing();

  function computeMaxZoomLevel() {
    const dur = duration();
    if (dur > 15000) return 1500;
    if (dur > 10000) return 2000;
    if (isSelectionExpandMode()) {
      if (dur > 0) {
        if (dur < 1000) return 15000;
        if (dur < 3000) return 3000;
      }
    }
    return 5000;
  }

  function computeMinZoomLevel() {
    // Ensure we have a valid width
    let visibleWidth = wrapperElement.clientWidth;
    const dur = duration();
    if (dur > 0) {
      minZoomLevel = Math.floor((visibleWidth - 2) / dur);
    }
  }

  /**
   * Execute actual WaveSurfer Zoom and Redraw (Expensive operation)
   */
  function applyZoom() {
    computeMinZoomLevel();
    if (typeof onBeforeZoom === 'function') onBeforeZoom();
    
    const maxZoom = computeMaxZoomLevel();
    zoomLevel = Math.min(Math.max(zoomLevel, minZoomLevel), maxZoom);

    // 1. Apply zoom to WaveSurfer (Triggers WASM calculation)
    if (ws && typeof ws.zoom === 'function' &&
        typeof ws.getDuration === 'function' && ws.getDuration() > 0) {
      ws.zoom(zoomLevel);
    }
    
    // 2. Sync Container Width
    const width = duration() * zoomLevel;
    container.style.width = `${width}px`;
    
    // Note: We do NOT set wrapperElement.style.width. It must remain fluid.

    applyZoomCallback(); // Triggers Spectrogram render()
    if (typeof onAfterZoom === 'function') onAfterZoom();    
    updateZoomButtons();
  }

  function setZoomLevel(newZoom) {
    computeMinZoomLevel();
    const maxZoom = computeMaxZoomLevel();
    zoomLevel = Math.min(Math.max(newZoom, minZoomLevel), maxZoom);
    applyZoom();
  }

  function updateZoomButtons() {
    computeMinZoomLevel();
    const maxZoom = computeMaxZoomLevel();
    if (zoomInBtn) zoomInBtn.disabled = zoomLevel >= maxZoom;
    if (zoomOutBtn) zoomOutBtn.disabled = zoomLevel <= minZoomLevel;
  }

  if (zoomInBtn) {
    zoomInBtn.onclick = () => {
      const maxZoom = computeMaxZoomLevel();
      if (zoomLevel < maxZoom) {
        zoomLevel = Math.min(zoomLevel + 500, maxZoom);
        applyZoom();
      }
    };
  }

  if (zoomOutBtn) {
    zoomOutBtn.onclick = () => {
      computeMinZoomLevel();
      if (zoomLevel > minZoomLevel) {
        zoomLevel = Math.max(zoomLevel - 500, minZoomLevel);
        applyZoom();
      }
    };
  }

  if (expandBtn) {
    expandBtn.onclick = () => {
      setZoomLevel(minZoomLevel);
    };
  }

  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey) return; 
    if (e.key === 'ArrowUp' && typeof onCtrlArrowUp === 'function') {
      const handled = onCtrlArrowUp();
      if (handled) { e.preventDefault(); return; }
    }
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); if (zoomInBtn) zoomInBtn.click(); break;
      case 'ArrowDown': e.preventDefault(); if (zoomOutBtn) zoomOutBtn.click(); break;
      case '0': e.preventDefault(); if (expandBtn) expandBtn.click(); break;
    }
  });  

  function resetZoomState() {
    if (container) container.style.width = '100%'; // Reset to allow min calc
    computeMinZoomLevel();
    zoomLevel = minZoomLevel;
    applyZoom();
  }

  /**
   * Handle smooth mouse wheel zoom with Ratio-Based Anchoring
   */
  function handleWheelZoom(e) {
    if (!e.ctrlKey) return; // Only zoom on Ctrl+Scroll
    e.preventDefault();

    computeMinZoomLevel();
    const maxZoom = computeMaxZoomLevel();
    
    // --- Step 1: Calculate Anchor Point (Ratio) ---
    // Instead of time, we calculate the percentage position of the mouse relative to the total width.
    // This is more robust against float rounding errors than time-based calculations.
    const rect = wrapperElement.getBoundingClientRect();
    const mouseX = e.clientX - rect.left; // Mouse position relative to viewport
    const currentScroll = wrapperElement.scrollLeft;
    
    // Get the EXACT current rendered width from the DOM
    const currentTotalWidth = container.offsetWidth; 
    
    // Calculate Mouse Absolute Position in Pixels (Start of audio to Mouse)
    const mouseAbsX = currentScroll + mouseX;
    
    // Calculate the Ratio (0.0 to 1.0) of where the mouse is in the file
    const anchorRatio = mouseAbsX / currentTotalWidth;

    // --- Step 2: Calculate New Zoom Level ---
    const delta = -e.deltaY;
    const scaleFactor = 1 + (delta * 0.001); 
    
    let newZoomLevel = zoomLevel * scaleFactor;
    newZoomLevel = Math.min(Math.max(newZoomLevel, minZoomLevel), maxZoom);

    // If no change, exit
    if (Math.abs(newZoomLevel - zoomLevel) < 0.01) return;

    // --- Step 3: Apply Visual Scaling (CSS) using requestAnimationFrame ---
    // We update the state immediately for the next event, but render in rAF
    zoomLevel = newZoomLevel;
    isWheelZooming = true;

    requestAnimationFrame(() => {
        const dur = duration();
        const newTotalWidth = dur * newZoomLevel;
        
        // 1. Resize Container (CSS Stretch)
        container.style.width = `${newTotalWidth}px`;

        // 2. Correct Scroll Position to keep Anchor
        // New Absolute Position = New Width * Original Ratio
        // New Scroll = New Absolute Position - Mouse Viewport Position
        const newScroll = (newTotalWidth * anchorRatio) - mouseX;
        
        wrapperElement.scrollLeft = newScroll;
    });

    // --- Step 4: Debounce Expensive Redraw ---
    if (wheelTimeout) {
      clearTimeout(wheelTimeout);
    }

    wheelTimeout = setTimeout(() => {
      isWheelZooming = false;
      
      // Perform the actual WASM redraw
      if (ws) {
        ws.zoom(zoomLevel);
        
        // Re-calculate one last time to ensure precision after the "real" layout update
        const finalWidth = duration() * zoomLevel;
        // We re-apply the scroll logic because ws.zoom() might shift things slightly
        const finalScroll = (finalWidth * anchorRatio) - mouseX;
        wrapperElement.scrollLeft = finalScroll;
      }
      
      applyZoomCallback();
      if (typeof onAfterZoom === 'function') onAfterZoom();
      updateZoomButtons();
      
    }, 30); // 30ms delay to ensure scrolling has settled
  }

  if (wrapperElement) {
    wrapperElement.addEventListener('wheel', handleWheelZoom, { passive: false });
  }

  return {
    applyZoom,
    updateZoomButtons,
    getZoomLevel: () => zoomLevel,
    setZoomLevel,
    resetZoomState,
  };
}