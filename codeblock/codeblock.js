document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("codeblock_canvas");
    const ctx = canvas.getContext("2d");
    const outputArea = document.getElementById("outputCode");
    const charCountLabel = document.getElementById("char_count_number");
    const toolbox = document.getElementById("toolbox");
    
    let blocks = [];
    let camera = { x: 0, y: 0, zoom: 1 };
    let isDraggingCanvas = false;
    let isDraggingBlock = false;
    let draggedBlockId = null;
    let dragOffset = { x: 0, y: 0 };
    
    // Config
    const BLOCK_HEIGHT = 40;
    const NOTCH_W = 16;
    const NOTCH_H = 7;
    const RADIUS = 8;
    const SNAP_DIST = 25;

    const BLOCK_TYPES = {
        'onDraw': { category: 'event', color: '#FFD700', text: 'function onDraw()', type: 'event', hasPrev: false, hasNext: true },
        'onTick': { category: 'event', color: '#FFD700', text: 'function onTick()', type: 'event', hasPrev: false, hasNext: true },
        'function': { category: 'event', color: '#FFD700', text: 'function name(args)', type: 'event', hasPrev: false, hasNext: true, params: {name: "myFunc", args: "x, y"} },
        'setColor': { category: 'draw', color: '#4CAF50', text: 'screen.setColor(r, g, b, a)', type: 'command', hasPrev: true, hasNext: true, params: {r: 255, g: 255, b: 255, a: 255} },
        'drawRect': { category: 'draw', color: '#2196F3', text: 'screen.drawRect(x, y, w, h)', type: 'command', hasPrev: true, hasNext: true, params: {x: 0, y: 0, w: 10, h: 10} },
        'drawRectF': { category: 'draw', color: '#2196F3', text: 'screen.drawRectF(x, y, w, h)', type: 'command', hasPrev: true, hasNext: true, params: {x: 0, y: 0, w: 10, h: 10} },
        'drawLine': { category: 'draw', color: '#2196F3', text: 'screen.drawLine(x1, y1, x2, y2)', type: 'command', hasPrev: true, hasNext: true, params: {x1: 0, y1: 0, x2: 10, y2: 10} },
        'drawCircle': { category: 'draw', color: '#2196F3', text: 'screen.drawCircle(x, y, r)', type: 'command', hasPrev: true, hasNext: true, params: {x: 10, y: 10, r: 5} },
        'drawCircleF': { category: 'draw', color: '#2196F3', text: 'screen.drawCircleF(x, y, r)', type: 'command', hasPrev: true, hasNext: true, params: {x: 10, y: 10, r: 5} },
        'drawText': { category: 'draw', color: '#2196F3', text: 'screen.drawText(x, y, text)', type: 'command', hasPrev: true, hasNext: true, params: {x: 0, y: 0, text: "Hello"} },
        'if': { category: 'logic', color: '#FF9800', text: 'if (condition) then', type: 'command', hasPrev: true, hasNext: true, params: {condition: "val == 1"} },
        'ifelse': { category: 'logic', color: '#FF9800', text: 'if (cond) else', type: 'command', hasPrev: true, hasNext: true, params: {condition: "val == 1"} },
        'else': { category: 'logic', color: '#FF9800', text: 'else', type: 'command', hasPrev: true, hasNext: true },
        'end': { category: 'logic', color: '#FF9800', text: 'end', type: 'command', hasPrev: true, hasNext: true },
        'for': { category: 'logic', color: '#FF9800', text: 'for i=min, max do', type: 'command', hasPrev: true, hasNext: true, params: {i:"i", min: 1, max: 10} },
        'varSet': { category: 'var', color: '#E91E63', text: 'var = value', type: 'command', hasPrev: true, hasNext: true, params: {name: "x", val: "0"} },
        'math': { category: 'var', color: '#E91E63', text: 'var = a + b', type: 'command', hasPrev: true, hasNext: true, params: {name: "x", a: "x", op: "+", b: "1"} },
        'getInputB': { category: 'io', color: '#9C27B0', text: 'input.getBool(ch)', type: 'command', hasPrev: true, hasNext: true, params: {name: "b", ch: 1} },
        'getInputN': { category: 'io', color: '#9C27B0', text: 'input.getNumber(ch)', type: 'command', hasPrev: true, hasNext: true, params: {name: "n", ch: 1} },
        'setOutputB': { category: 'io', color: '#9C27B0', text: 'output.setBool(ch, val)', type: 'command', hasPrev: true, hasNext: true, params: {ch: 1, val: "true"} },
        'setOutputN': { category: 'io', color: '#9C27B0', text: 'output.setNumber(ch, val)', type: 'command', hasPrev: true, hasNext: true, params: {ch: 1, val: "0"} }
    };

    function init() {
        resize();
        window.addEventListener('resize', resize);
        addBlock('onDraw', 50, 50);
        generateLua();
        loop();
    }

    function resize() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }

    // Toolbox Drag - Improved with direct Canvas check
    document.querySelectorAll('.draggable_block').forEach(el => {
        el.addEventListener('dragstart', e => {
            e.dataTransfer.setData('type', e.target.dataset.type);
            e.dataTransfer.effectAllowed = 'copy';
        });
    });

    canvas.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    canvas.addEventListener('drop', e => {
        e.preventDefault();
        const type = e.dataTransfer.getData('type');
        if (!type) return;
        
        const rect = canvas.getBoundingClientRect();
        const m = {
            wx: (e.clientX - rect.left - camera.x) / camera.zoom,
            wy: (e.clientY - rect.top - camera.y) / camera.zoom
        };
        
        addBlock(type, m.wx - 50, m.wy - 20); // Center slightly on drop
        generateLua();
    });

    // Interaction
    canvas.addEventListener('mousedown', e => {
        const m = getMouse(e);
        const hit = blocks.slice().reverse().find(b => 
            m.wx >= b.x && m.wx <= b.x + b.w && m.wy >= b.y && m.wy <= b.y + b.h
        );

        if (hit) {
            const inputKey = getClickedInput(m.wx - hit.x, m.wy - hit.y, hit);
            if (inputKey) {
                editValue(hit, inputKey);
                return;
            }

            isDraggingBlock = true;
            draggedBlockId = hit.id;
            dragOffset = { x: m.wx - hit.x, y: m.wy - hit.y };
            disconnect(hit);
            
            // Move to end for rendering on top
            const idx = blocks.indexOf(hit);
            blocks.push(blocks.splice(idx, 1)[0]);
            return;
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

    window.addEventListener('mouseup', e => {
        if (isDraggingBlock) {
            const b = blocks.find(x => x.id === draggedBlockId);
            if (b) {
                // Trash feature: if dropped over toolbox area
                const toolboxRect = toolbox.getBoundingClientRect();
                if (e.clientX < toolboxRect.right) {
                    blocks = blocks.filter(x => x.id !== b.id);
                } else {
                    snap(b);
                }
            }
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
        const b = {
            id: Math.random(),
            type, x, y, w: 220, h: BLOCK_HEIGHT,
            color: t.color, text: t.text,
            params: t.params ? JSON.parse(JSON.stringify(t.params)) : {},
            next: null
        };
        ctx.font = "bold 13px sans-serif";
        b.w = Math.max(180, ctx.measureText(b.text).width + 70);
        blocks.push(b);
        return b;
    }

    function disconnect(target) {
        blocks.forEach(b => { if (b.next === target.id) b.next = null; });
    }

    function snap(child) {
        const t = BLOCK_TYPES[child.type];
        if (!t.hasPrev) return;
        
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

    function getClickedInput(lx, ly, b) {
        if (ly > 5 && ly < BLOCK_HEIGHT - 5) {
            if (b.params && Object.keys(b.params).length > 0) return 'all';
        }
        return null;
    }

    function editValue(b, key) {
        const res = prompt(`Edit values for ${b.type}:`, JSON.stringify(b.params));
        if (res) {
            try { 
                b.params = JSON.parse(res); 
                generateLua(); 
            } catch(e) { console.error("Invalid JSON"); }
        }
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
            ctx.lineTo(b.x + 20 + 3, b.y + NOTCH_H);
            ctx.lineTo(b.x + 20 + NOTCH_W - 3, b.y + NOTCH_H);
            ctx.lineTo(b.x + 20 + NOTCH_W, b.y);
        }
        
        ctx.lineTo(b.x + b.w - RADIUS, b.y);
        ctx.quadraticCurveTo(b.x + b.w, b.y, b.x + b.w, b.y + RADIUS);
        ctx.lineTo(b.x + b.w, b.y + b.h - RADIUS);
        ctx.quadraticCurveTo(b.x + b.w, b.y + b.h, b.x + b.w - RADIUS, b.y + b.h);
        
        if (t.hasNext) {
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
        let display = b.text;
        if (b.type === 'varSet') display = `${b.params.name} = ${b.params.val}`;
        if (b.type === 'if' || b.type === 'ifelse') display = `if ${b.params.condition} then`;
        if (b.type === 'function') display = `function ${b.params.name}(${b.params.args})`;
        ctx.fillText(display, b.x + 15, b.y + b.h/2 + 5);
    }

    function generateLua() {
        let code = "-- Generated Lua\n";
        const roots = blocks.filter(b => !BLOCK_TYPES[b.type].hasPrev);
        
        roots.forEach(root => {
            if (root.type === 'function') code += `function ${root.params.name}(${root.params.args})\n`;
            else code += `${root.text}\n`;
            
            let curr = root.next;
            let indent = "  ";
            while(curr) {
                const b = blocks.find(x => x.id === curr);
                if (!b) break;
                if (b.type === 'end' || b.type === 'else') indent = indent.slice(0, -2);
                code += `${indent}${getLua(b)}\n`;
                if (['if', 'ifelse', 'else', 'for'].includes(b.type)) indent += "  ";
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
            case 'setColor': return `screen.setColor(${p.r}, ${p.g}, ${p.b}, ${p.a})`;
            case 'drawRect': return `screen.drawRect(${p.x}, ${p.y}, ${p.w}, ${p.h})`;
            case 'drawRectF': return `screen.drawRectF(${p.x}, ${p.y}, ${p.w}, ${p.h})`;
            case 'drawLine': return `screen.drawLine(${p.x1}, ${p.y1}, ${p.x2}, ${p.y2})`;
            case 'drawCircle': return `screen.drawCircle(${p.x}, ${p.y}, ${p.r})`;
            case 'drawCircleF': return `screen.drawCircleF(${p.x}, ${p.y}, ${p.r})`;
            case 'drawText': return `screen.drawText(${p.x}, ${p.y}, "${p.text}")`;
            case 'if': case 'ifelse': return `if ${p.condition} then`;
            case 'else': return `else`;
            case 'end': return `end`;
            case 'for': return `for ${p.i}=${p.min}, ${p.max} do`;
            case 'varSet': return `${p.name} = ${p.val}`;
            case 'math': return `${p.name} = ${p.a} ${p.op} ${p.b}`;
            case 'getInputB': return `${p.name} = input.getBool(${p.ch})`;
            case 'getInputN': return `${p.name} = input.getNumber(${p.ch})`;
            case 'setOutputB': return `output.setBool(${p.ch}, ${p.val})`;
            case 'setOutputN': return `output.setNumber(${p.ch}, ${p.val})`;
            default: return "";
        }
    }

    init();
});
