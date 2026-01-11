document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("codeblock_canvas");
    const ctx = canvas.getContext("2d");
    const outputArea = document.getElementById("outputCode");
    const charCountLabel = document.getElementById("char_count_number");
    
    let blocks = [];
    let camera = { x: 0, y: 0, zoom: 1 };
    let isDraggingCanvas = false;
    let isDraggingBlock = false;
    let draggedBlockId = null;
    let dragOffset = { x: 0, y: 0 };
    
    const BLOCK_TYPES = {
        'onDraw': { category: 'event', color: '#FFD700', text: 'function onDraw()', type: 'event', hasPrev: false, hasNext: true },
        'onTick': { category: 'event', color: '#FFD700', text: 'function onTick()', type: 'event', hasPrev: false, hasNext: true },
        'setColor': { category: 'draw', color: '#4CAF50', text: 'screen.setColor(r, g, b, a)', type: 'command', hasPrev: true, hasNext: true, params: {r: 255, g: 255, b: 255, a: 255} },
        'drawRect': { category: 'draw', color: '#2196F3', text: 'screen.drawRect(x, y, w, h)', type: 'command', hasPrev: true, hasNext: true, params: {x: 0, y: 0, w: 10, h: 10} },
        'drawRectF': { category: 'draw', color: '#2196F3', text: 'screen.drawRectF(x, y, w, h)', type: 'command', hasPrev: true, hasNext: true, params: {x: 0, y: 0, w: 10, h: 10} },
        'drawCircle': { category: 'draw', color: '#2196F3', text: 'screen.drawCircle(x, y, r)', type: 'command', hasPrev: true, hasNext: true, params: {x: 10, y: 10, r: 5} },
        'drawText': { category: 'draw', color: '#2196F3', text: 'screen.drawText(x, y, text)', type: 'command', hasPrev: true, hasNext: true, params: {x: 0, y: 0, text: "Hello"} },
        'if': { category: 'logic', color: '#FF9800', text: 'if (condition) then', type: 'wrapper', hasPrev: true, hasNext: true, params: {condition: "true"} },
        'else': { category: 'logic', color: '#FF9800', text: 'else', type: 'command', hasPrev: true, hasNext: true },
        'end': { category: 'logic', color: '#FF9800', text: 'end', type: 'command', hasPrev: true, hasNext: true },
        'varSet': { category: 'var', color: '#E91E63', text: 'var = value', type: 'command', hasPrev: true, hasNext: true, params: {name: "x", val: "0"} }
    };

    const BLOCK_HEIGHT = 38;
    const NOTCH_W = 15;
    const NOTCH_H = 6;
    const RADIUS = 8;
    const SNAP_DIST = 20;

    function init() {
        resize();
        window.addEventListener('resize', resize);
        addBlock('onDraw', 100, 100);
        loop();
    }

    function resize() {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    }

    // Toolbox Drag & Drop
    document.querySelectorAll('.draggable_block').forEach(el => {
        el.addEventListener('dragstart', e => e.dataTransfer.setData('type', e.target.dataset.type));
    });

    canvas.addEventListener('dragover', e => e.preventDefault());
    canvas.addEventListener('drop', e => {
        const type = e.dataTransfer.getData('type');
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - camera.x) / camera.zoom;
        const y = (e.clientY - rect.top - camera.y) / camera.zoom;
        addBlock(type, x, y);
        generateLua();
    });

    // Interaction
    canvas.addEventListener('mousedown', e => {
        const m = getMouse(e);
        for (let i = blocks.length - 1; i >= 0; i--) {
            const b = blocks[i];
            if (m.wx >= b.x && m.wx <= b.x + b.w && m.wy >= b.y && m.wy <= b.y + b.h) {
                if (e.button === 2) { editBlock(b); return; }
                isDraggingBlock = true;
                draggedBlockId = b.id;
                dragOffset = { x: m.wx - b.x, y: m.wy - b.y };
                disconnect(b);
                blocks.push(blocks.splice(i, 1)[0]);
                return;
            }
        }
        isDraggingCanvas = true;
        dragOffset = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', e => {
        const m = getMouse(e);
        if (isDraggingBlock) {
            const b = blocks.find(x => x.id === draggedBlockId);
            b.x = m.wx - dragOffset.x;
            b.y = m.wy - dragOffset.y;
        } else if (isDraggingCanvas) {
            camera.x += e.clientX - dragOffset.x;
            camera.y += e.clientY - dragOffset.y;
            dragOffset = { x: e.clientX, y: e.clientY };
        }
    });

    window.addEventListener('mouseup', () => {
        if (isDraggingBlock) {
            const b = blocks.find(x => x.id === draggedBlockId);
            if (b) snap(b);
            generateLua();
        }
        isDraggingBlock = false;
        isDraggingCanvas = false;
    });

    function getMouse(e) {
        const r = canvas.getBoundingClientRect();
        return {
            wx: (e.clientX - r.left - camera.x) / camera.zoom,
            wy: (e.clientY - r.top - camera.y) / camera.zoom
        };
    }

    function addBlock(type, x, y, params = null) {
        const t = BLOCK_TYPES[type];
        const b = {
            id: Math.random(),
            type, x, y, w: 180, h: BLOCK_HEIGHT,
            color: t.color, text: t.text,
            params: params || (t.params ? {...t.params} : {}),
            next: null
        };
        blocks.push(b);
        return b;
    }

    function disconnect(target) {
        blocks.forEach(b => { if (b.next === target.id) b.next = null; });
    }

    function snap(child) {
        if (!BLOCK_TYPES[child.type].hasPrev) return;
        for (const parent of blocks) {
            if (parent.id === child.id || !BLOCK_TYPES[parent.type].hasNext) continue;
            const dist = Math.hypot(parent.x - child.x, (parent.y + parent.h) - child.y);
            if (dist < SNAP_DIST) {
                const oldNext = parent.next;
                parent.next = child.id;
                child.x = parent.x;
                child.y = parent.y + parent.h;
                if (oldNext) {
                    child.next = oldNext;
                    updateChain(oldNext, child.x, child.y + child.h);
                }
                break;
            }
        }
    }

    function updateChain(id, x, y) {
        const b = blocks.find(i => i.id === id);
        if (!b) return;
        b.x = x; b.y = y;
        if (b.next) updateChain(b.next, x, y + b.h);
    }

    function editBlock(b) {
        if (!b.params) return;
        const res = prompt(`Edit ${b.type} params:`, JSON.stringify(b.params));
        if (res) { try { b.params = JSON.parse(res); generateLua(); } catch(e) {} }
    }

    function loop() {
        ctx.fillStyle = "#1e1e1e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(camera.x, camera.y);
        ctx.scale(camera.zoom, camera.zoom);
        blocks.forEach(drawBlock);
        ctx.restore();
        requestAnimationFrame(loop);
    }

    function drawBlock(b) {
        ctx.fillStyle = b.color;
        ctx.beginPath();
        // Top edge with notch
        ctx.moveTo(b.x, b.y + RADIUS);
        ctx.quadraticCurveTo(b.x, b.y, b.x + RADIUS, b.y);
        if (BLOCK_TYPES[b.type].hasPrev) {
            ctx.lineTo(b.x + 20, b.y);
            ctx.lineTo(b.x + 20 + 3, b.y + NOTCH_H);
            ctx.lineTo(b.x + 20 + NOTCH_W - 3, b.y + NOTCH_H);
            ctx.lineTo(b.x + 20 + NOTCH_W, b.y);
        }
        ctx.lineTo(b.x + b.w - RADIUS, b.y);
        ctx.quadraticCurveTo(b.x + b.w, b.y, b.x + b.w, b.y + RADIUS);
        // Right & Bottom
        ctx.lineTo(b.x + b.w, b.y + b.h - RADIUS);
        ctx.quadraticCurveTo(b.x + b.w, b.y + b.h, b.x + b.w - RADIUS, b.y + b.h);
        if (BLOCK_TYPES[b.type].hasNext) {
            ctx.lineTo(b.x + 20 + NOTCH_W, b.y + b.h);
            ctx.lineTo(b.x + 20 + NOTCH_W - 3, b.y + b.h + NOTCH_H);
            ctx.lineTo(b.x + 20 + 3, b.y + b.h + NOTCH_H);
            ctx.lineTo(b.x + 20, b.y + b.h);
        }
        ctx.lineTo(b.x + RADIUS, b.y + b.h);
        ctx.quadraticCurveTo(b.x, b.y + b.h, b.x, b.y + b.h - RADIUS);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.stroke();

        ctx.fillStyle = "#000";
        ctx.font = "bold 13px sans-serif";
        let txt = b.text;
        if (b.type === 'setColor') txt = `setColor(${b.params.r},${b.params.g},${b.params.b})`;
        if (b.type === 'drawRect') txt = `rect(${b.params.x},${b.params.y},${b.params.w},${b.params.h})`;
        ctx.fillText(txt, b.x + 12, b.y + b.h/2 + 5);
    }

    function generateLua() {
        let code = "-- Generated Lua\n";
        const roots = blocks.filter(b => !BLOCK_TYPES[b.type].hasPrev);
        roots.forEach(root => {
            code += `${root.text}\n`;
            let curr = root.next;
            let indent = "  ";
            while(curr) {
                const b = blocks.find(x => x.id === curr);
                if (!b) break;
                if (b.type === 'end') indent = indent.slice(0,-2);
                code += `${indent}${getLua(b)}\n`;
                if (b.type === 'if' || b.type === 'else') indent += "  ";
                curr = b.next;
            }
            code += "end\n\n";
        });
        outputArea.value = code;
        charCountLabel.innerText = code.length;
    }

    function getLua(b) {
        const p = b.params;
        switch(b.type) {
            case 'setColor': return `screen.setColor(${p.r},${p.g},${p.b},${p.a})`;
            case 'drawRect': return `screen.drawRect(${p.x},${p.y},${p.w},${p.h})`;
            case 'drawRectF': return `screen.drawRectF(${p.x},${p.y},${p.w},${p.h})`;
            case 'drawCircle': return `screen.drawCircle(${p.x},${p.y},${p.r})`;
            case 'drawText': return `screen.drawText(${p.x},${p.y},"${p.text}")`;
            case 'if': return `if ${p.condition} then`;
            case 'else': return `else`;
            case 'end': return `end`;
            case 'varSet': return `${p.name} = ${p.val}`;
            default: return "";
        }
    }

    document.getElementById('copy_code').onclick = () => {
        outputArea.select();
        document.execCommand('copy');
    };

    document.getElementById('clear_canvas').onclick = () => {
        if(confirm("Clear?")) { blocks = []; addBlock('onDraw', 50, 50); generateLua(); }
    };

    init();
});
