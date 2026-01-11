document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("codeblock_canvas");
    const ctx = canvas.getContext("2d");
    const outputArea = document.getElementById("outputCode");
    const charCountLabel = document.getElementById("char_count_number");
    const clearBtn = document.getElementById("clear_canvas");
    
    let blocks = [];
    let camera = { x: 0, y: 0, zoom: 1 };
    let isDraggingCanvas = false;
    let isDraggingBlock = false;
    let draggedBlockId = null;
    let dragOffset = { x: 0, y: 0 };
    
    const BLOCK_HEIGHT = 30;
    const NOTCH_W = 16;
    const NOTCH_H = 6;
    const RADIUS = 6;
    const SNAP_DIST = 20;

    const BLOCK_TYPES = {
        'onDraw': { color: '#FFD700', text: 'function onDraw()', hasPrev: false, hasNext: true },
        'onTick': { color: '#FFD700', text: 'function onTick()', hasPrev: false, hasNext: true },
        
        'canvasDraw': { color: '#03A9F4', text: 'Draw Canvas Data', hasPrev: true, hasNext: true, params: {txtData: "[]"} },
        'touchDetect': { color: '#03A9F4', text: 'isTouched(tx, ty, x, y, w, h)', hasPrev: true, hasNext: true },
        'screenDetect': { color: '#03A9F4', text: 'Identify Screen Size', hasPrev: true, hasNext: true },

        'ifStat': { color: '#9C27B0', text: 'if [cond] then', hasPrev: true, hasNext: true, params: {cond: "true"} },
        'elseStat': { color: '#9C27B0', text: 'else', hasPrev: true, hasNext: true },
        'comparison': { color: '#9C27B0', text: 'a == b', hasPrev: true, hasNext: true },
        'logicAnd': { color: '#9C27B0', text: 'a and b', hasPrev: true, hasNext: true },
        'logicNot': { color: '#9C27B0', text: 'not val', hasPrev: true, hasNext: true },

        'setColor': { color: '#4CAF50', text: 'screen.setColor(r, g, b, a)', hasPrev: true, hasNext: true, params: {r: 255, g: 255, b: 255, a: 255} },
        'drawRectF': { color: '#2196F3', text: 'screen.drawRectF(x, y, w, h)', hasPrev: true, hasNext: true, params: {x: 0, y: 0, w: 10, h: 10} },
        'drawCircle': { color: '#2196F3', text: 'screen.drawCircle(x, y, r)', hasPrev: true, hasNext: true, params: {x: 0, y: 0, r: 5} },
        'drawText': { color: '#2196F3', text: 'screen.drawText(x, y, text)', hasPrev: true, hasNext: true, params: {x: 0, y: 0, text: "Hello"} },

        'getInputN': { color: '#FF5722', text: 'var = input.getNumber(i)', hasPrev: true, hasNext: true, params: {var: "n", i: 1} },
        'getInputB': { color: '#FF5722', text: 'var = input.getBool(i)', hasPrev: true, hasNext: true, params: {var: "b", i: 1} },
        'setOutputN': { color: '#FF5722', text: 'output.setNumber(i, v)', hasPrev: true, hasNext: true, params: {i: 1, v: 0} },
        'setOutputB': { color: '#FF5722', text: 'output.setBool(i, v)', hasPrev: true, hasNext: true, params: {i: 1, v: "false"} },

        'blink': { color: '#FF9800', text: 'Blink Logic (ticks)', hasPrev: true, hasNext: true },
        'mathAbs': { color: '#FF9800', text: 'math.abs(n)', hasPrev: true, hasNext: true },
        'mathSin': { color: '#FF9800', text: 'math.sin(n)', hasPrev: true, hasNext: true },
        'lerp': { color: '#FF9800', text: 'Lerp(a, b, t)', hasPrev: true, hasNext: true },
        'rgb': { color: '#FF9800', text: 'HSV to RGB converter', hasPrev: true, hasNext: true },

        'varSet': { color: '#E91E63', text: 'set [var] to [val]', hasPrev: true, hasNext: true, params: {name: "x", val: "0"} },
        'end': { color: '#607D8B', text: 'end', hasPrev: true, hasNext: true }
    };

    function init() {
        resize();
        window.addEventListener('resize', resize);
        
        // Re-bind draggable events to ensure they work
        const toolboxBlocks = document.querySelectorAll('.draggable_block');
        toolboxBlocks.forEach(el => {
            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('type', e.target.getAttribute('data-type'));
            });
        });

        addBlock('onDraw', 50, 50);
        generateLua();
        loop();
    }

    function resize() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }

    canvas.addEventListener('dragover', e => e.preventDefault());
    canvas.addEventListener('drop', e => {
        e.preventDefault();
        const type = e.dataTransfer.getData('type');
        if (!type) return;
        const rect = canvas.getBoundingClientRect();
        const m = {
            wx: (e.clientX - rect.left - camera.x) / camera.zoom,
            wy: (e.clientY - rect.top - camera.y) / camera.zoom
        };
        addBlock(type, m.wx, m.wy);
        generateLua();
    });

    clearBtn.onclick = () => { if(confirm("Clear all blocks?")) { blocks = []; generateLua(); }};

    canvas.addEventListener('mousedown', e => {
        const m = getMouse(e);
        const hit = blocks.slice().reverse().find(b => 
            m.wx >= b.x && m.wx <= b.x + b.w && m.wy >= b.y && m.wy <= b.y + b.h
        );

        if (hit) {
            isDraggingBlock = true;
            draggedBlockId = hit.id;
            dragOffset = { x: m.wx - hit.x, y: m.wy - hit.y };
            disconnect(hit);
            const idx = blocks.indexOf(hit);
            blocks.push(blocks.splice(idx, 1)[0]);
            return;
        }
        isDraggingCanvas = true;
        dragOffset = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('dblclick', e => {
        const m = getMouse(e);
        const hit = blocks.slice().reverse().find(b => 
            m.wx >= b.x && m.wx <= b.x + b.w && m.wy >= b.y && m.wy <= b.y + b.h
        );
        if (hit) {
            if (hit.type === 'canvasDraw') {
                const input = document.createElement('input');
                input.type = 'file';
                input.onchange = e => {
                    const reader = new FileReader();
                    reader.onload = ev => { hit.params.txtData = ev.target.result; generateLua(); };
                    reader.readAsText(e.target.files[0]);
                };
                input.click();
            } else if (Object.keys(hit.params).length > 0) {
                const result = prompt("Edit properties (JSON format):", JSON.stringify(hit.params));
                if (result) { try { hit.params = JSON.parse(result); generateLua(); } catch(e) {} }
            }
        }
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

    function addBlock(type, x, y) {
        const t = BLOCK_TYPES[type];
        if(!t) return;
        const b = {
            id: Math.random(),
            type, x, y, w: 180, h: BLOCK_HEIGHT,
            color: t.color, text: t.text,
            params: t.params ? JSON.parse(JSON.stringify(t.params)) : {},
            next: null
        };
        ctx.font = "bold 12px 'Segoe UI'";
        b.w = Math.max(160, ctx.measureText(b.text).width + 60);
        blocks.push(b);
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
                if (oldNext) { child.next = oldNext; updateChain(oldNext, child.x, child.y + child.h); }
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
        const t = BLOCK_TYPES[b.type];
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y + RADIUS);
        ctx.quadraticCurveTo(b.x, b.y, b.x + RADIUS, b.y);
        if (t.hasPrev) {
            ctx.lineTo(b.x + 20, b.y);
            ctx.lineTo(b.x + 20 + 2, b.y + NOTCH_H);
            ctx.lineTo(b.x + 20 + NOTCH_W - 2, b.y + NOTCH_H);
            ctx.lineTo(b.x + 20 + NOTCH_W, b.y);
        }
        ctx.lineTo(b.x + b.w - RADIUS, b.y);
        ctx.quadraticCurveTo(b.x + b.w, b.y, b.x + b.w, b.y + RADIUS);
        ctx.lineTo(b.x + b.w, b.y + b.h - RADIUS);
        ctx.quadraticCurveTo(b.x + b.w, b.y + b.h, b.x + b.w - RADIUS, b.y + b.h);
        if (t.hasNext) {
            ctx.lineTo(b.x + 20 + NOTCH_W, b.y + b.h);
            ctx.lineTo(b.x + 20 + NOTCH_W - 2, b.y + b.h + NOTCH_H);
            ctx.lineTo(b.x + 20 + 2, b.y + b.h + NOTCH_H);
            ctx.lineTo(b.x + 20, b.y + b.h);
        }
        ctx.lineTo(b.x + RADIUS, b.y + b.h);
        ctx.quadraticCurveTo(b.x, b.y + b.h, b.x, b.y + b.h - RADIUS);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#000";
        ctx.font = "bold 11px 'Segoe UI'";
        let display = b.text;
        if (b.type === 'canvasDraw') display = "Draw Canvas (DBL Click to load)";
        ctx.fillText(display, b.x + 10, b.y + 19);
    }

    function generateLua() {
        let code = "-- Generated Lua\n";
        const roots = blocks.filter(b => !BLOCK_TYPES[b.type].hasPrev);
        roots.forEach(root => {
            code += `${root.text}\n`;
            let curr = root.next;
            while(curr) {
                const b = blocks.find(x => x.id === curr);
                if (!b) break;
                code += getLua(b);
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
            case 'canvasDraw': 
                let data = [];
                try { data = JSON.parse(p.txtData); } catch(e) {}
                let lua = "  -- Canvas\n";
                data.forEach(d => {
                    if(d.type === 'line') lua += `  screen.drawLine(${d.x1},${d.y1},${d.x2},${d.y2})\n`;
                    if(d.type === 'rectF') lua += `  screen.drawRectF(${d.x1},${d.y1},${d.x2-d.x1},${d.y2-d.y1})\n`;
                });
                return lua;
            case 'ifStat': return `  if ${p.cond} then\n`;
            case 'elseStat': return "  else\n";
            case 'getInputN': return `  ${p.var} = input.getNumber(${p.i})\n`;
            case 'getInputB': return `  ${p.var} = input.getBool(${p.i})\n`;
            case 'setOutputN': return `  output.setNumber(${p.i}, ${p.v})\n`;
            case 'setOutputB': return `  output.setBool(${p.i}, ${p.v})\n`;
            case 'mathAbs': return "  n = math.abs(n)\n";
            case 'mathSin': return "  n = math.sin(n)\n";
            case 'setColor': return `  screen.setColor(${p.r},${p.g},${p.b},${p.a})\n`;
            case 'drawRectF': return `  screen.drawRectF(${p.x},${p.y},${p.w},${p.h})\n`;
            case 'drawCircle': return `  screen.drawCircle(${p.x},${p.y},${p.r})\n`;
            case 'drawText': return `  screen.drawText(${p.x},${p.y},"${p.text}")\n`;
            case 'varSet': return `  ${p.name} = ${p.val}\n`;
            case 'end': return "  end\n";
            default: return `  -- ${b.text}\n`;
        }
    }

    init();
});
