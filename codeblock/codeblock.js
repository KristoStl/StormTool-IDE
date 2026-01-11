/**
 * Stormworks Lua Codeblock Editor
 * Logic Engine & UI Handler
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- Configuration & State ---
    const canvas = document.getElementById("codeblock_canvas");
    const ctx = canvas.getContext("2d");
    const outputArea = document.getElementById("outputCode");
    const charCountLabel = document.getElementById("char_count_number");
    
    // Canvas State
    let blocks = []; // Array to store all block objects
    let camera = { x: 0, y: 0, zoom: 1 };
    let isDraggingCanvas = false;
    let isDraggingBlock = false;
    let dragStart = { x: 0, y: 0 };
    let draggedBlockId = null;
    let dragOffset = { x: 0, y: 0 };
    
    // Block Definitions (Templates)
    const BLOCK_TYPES = {
        // Events
        'onDraw': { category: 'event', color: '#FFD700', text: 'function onDraw()', type: 'event', hasPrev: false, hasNext: true },
        'onTick': { category: 'event', color: '#FFD700', text: 'function onTick()', type: 'event', hasPrev: false, hasNext: true },
        
        // Drawing Commands
        'setColor': { category: 'draw', color: '#4CAF50', text: 'screen.setColor(r, g, b, a)', type: 'command', hasPrev: true, hasNext: true, params: {r: 255, g: 255, b: 255, a: 255} },
        'drawRect': { category: 'draw', color: '#2196F3', text: 'screen.drawRect(x, y, w, h)', type: 'command', hasPrev: true, hasNext: true, params: {x: 0, y: 0, w: 10, h: 10} },
        'drawRectF': { category: 'draw', color: '#2196F3', text: 'screen.drawRectF(x, y, w, h)', type: 'command', hasPrev: true, hasNext: true, params: {x: 0, y: 0, w: 10, h: 10} },
        'drawLine': { category: 'draw', color: '#2196F3', text: 'screen.drawLine(x1, y1, x2, y2)', type: 'command', hasPrev: true, hasNext: true, params: {x1: 0, y1: 0, x2: 10, y2: 10} },
        'drawCircle': { category: 'draw', color: '#2196F3', text: 'screen.drawCircle(x, y, r)', type: 'command', hasPrev: true, hasNext: true, params: {x: 10, y: 10, r: 5} },
        'drawText': { category: 'draw', color: '#2196F3', text: 'screen.drawText(x, y, text)', type: 'command', hasPrev: true, hasNext: true, params: {x: 0, y: 0, text: "Hello"} },
        
        // Logic
        'if': { category: 'logic', color: '#FF9800', text: 'if (condition) then', type: 'wrapper', hasPrev: true, hasNext: true, hasNest: true, params: {condition: "true"} },
        'else': { category: 'logic', color: '#FF9800', text: 'else', type: 'wrapper', hasPrev: true, hasNext: true, hasNest: true },
        'end': { category: 'logic', color: '#FF9800', text: 'end', type: 'terminator', hasPrev: true, hasNext: true },
        
        // Input
        'isPressed': { category: 'input', color: '#9C27B0', text: 'input.getBool(ch)', type: 'value', returnType: 'boolean', params: {ch: 1} },
        'clickDetect': { category: 'input', color: '#9C27B0', text: 'Click Detect (x,y,w,h)', type: 'logic_sugar', hasPrev: true, hasNext: true, hasNest: true, params: {x:0, y:0, w:32, h:32} }, // Custom block
        
        // Variables
        'varSet': { category: 'var', color: '#E91E63', text: 'var = value', type: 'command', hasPrev: true, hasNext: true, params: {name: "x", val: "0"} },
        'math': { category: 'var', color: '#E91E63', text: 'math operation', type: 'command', hasPrev: true, hasNext: true, params: {op: "x = x + 1"} }
    };

    // Constants
    const BLOCK_HEIGHT = 40;
    const BLOCK_WIDTH_DEFAULT = 200;
    const NOTCH_SIZE = 10;
    const SNAP_RADIUS = 20;

    // --- Initialization ---
    function init() {
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
        // Initial "onDraw" block
        addBlock('onDraw', 50, 50);

        requestAnimationFrame(gameLoop);
    }

    function resizeCanvas() {
        const parent = canvas.parentElement;
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        draw();
    }

    // --- Interaction Handlers ---

    // 1. Dragging from Toolbox (HTML5 Drag & Drop)
    const draggables = document.querySelectorAll('.draggable_block');
    draggables.forEach(elem => {
        elem.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('type', e.target.getAttribute('data-type'));
        });
    });

    canvas.addEventListener('dragover', (e) => {
        e.preventDefault(); // Allow dropping
    });

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('type');
        const rect = canvas.getBoundingClientRect();
        
        // Calculate world coordinates
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - camera.x) / camera.zoom;
        const worldY = (mouseY - camera.y) / camera.zoom;

        addBlock(type, worldX, worldY);
        generateLua();
    });

    // 2. Interaction on Canvas (Mouse Events)
    canvas.addEventListener('mousedown', (e) => {
        const mouse = getMousePos(e);
        
        // Check if clicked on a block
        // Iterate backwards to select top-most block first
        for (let i = blocks.length - 1; i >= 0; i--) {
            const b = blocks[i];
            if (isPointInBlock(mouse.worldX, mouse.worldY, b)) {
                // If right click, edit parameters
                if (e.button === 2) {
                    editBlockParams(b);
                    return;
                }

                // Left click: Start Dragging Block
                isDraggingBlock = true;
                draggedBlockId = b.id;
                dragOffset.x = mouse.worldX - b.x;
                dragOffset.y = mouse.worldY - b.y;
                
                // Disconnect from parent if connected
                disconnectBlock(b);
                
                // Move to end of array (render on top)
                blocks.push(blocks.splice(i, 1)[0]);
                return;
            }
        }

        // Clicked on background: Pan Canvas
        isDraggingCanvas = true;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
    });

    canvas.addEventListener('mousemove', (e) => {
        const mouse = getMousePos(e);

        if (isDraggingBlock && draggedBlockId !== null) {
            const b = getBlockById(draggedBlockId);
            if (b) {
                b.x = mouse.worldX - dragOffset.x;
                b.y = mouse.worldY - dragOffset.y;
                
                // Visual feedback for snapping (could add highlight here)
            }
        } else if (isDraggingCanvas) {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            camera.x += dx;
            camera.y += dy;
            dragStart.x = e.clientX;
            dragStart.y = e.clientY;
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (isDraggingBlock && draggedBlockId !== null) {
            const b = getBlockById(draggedBlockId);
            if (b) {
                // Try to snap to another block
                trySnap(b);
            }
            isDraggingBlock = false;
            draggedBlockId = null;
            generateLua();
        }
        isDraggingCanvas = false;
    });

    // Prevent context menu on canvas
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // --- Core Logic ---

    function addBlock(type, x, y, params = null) {
        const template = BLOCK_TYPES[type];
        if (!template) return;

        const id = Date.now() + Math.random();
        const newBlock = {
            id: id,
            type: type,
            x: x,
            y: y,
            w: BLOCK_WIDTH_DEFAULT,
            h: BLOCK_HEIGHT,
            color: template.color,
            text: template.text,
            template: template,
            params: params ? {...params} : (template.params ? {...template.params} : {}),
            next: null // ID of the connected block below
        };

        // Custom widths based on text length roughly
        newBlock.w = Math.max(BLOCK_WIDTH_DEFAULT, newBlock.text.length * 8 + 20);

        blocks.push(newBlock);
        return newBlock;
    }

    function getBlockById(id) {
        return blocks.find(b => b.id === id);
    }

    function isPointInBlock(x, y, block) {
        return x >= block.x && x <= block.x + block.w &&
               y >= block.y && y <= block.y + block.h;
    }

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            worldX: (e.clientX - rect.left - camera.x) / camera.zoom,
            worldY: (e.clientY - rect.top - camera.y) / camera.zoom
        };
    }

    function disconnectBlock(block) {
        // Find any block that points to this block and clear the connection
        blocks.forEach(b => {
            if (b.next === block.id) {
                b.next = null;
            }
        });
    }

    function trySnap(childBlock) {
        if (!childBlock.template.hasPrev) return; // Can't snap to top if it's an event

        let snapped = false;

        blocks.forEach(parentBlock => {
            if (parentBlock.id === childBlock.id) return; // Can't snap to self
            if (!parentBlock.template.hasNext) return; // Parent must accept connections

            // Connection point: Bottom of parent
            const pX = parentBlock.x;
            const pY = parentBlock.y + parentBlock.h;

            // Target point: Top of child
            const cX = childBlock.x;
            const cY = childBlock.y;

            const dist = Math.hypot(pX - cX, pY - cY);

            if (dist < SNAP_RADIUS) {
                // If parent already has a next, push it down or replace? 
                // For simplicity, we just overwrite for now, or insert (linked list logic)
                
                // Simple insert logic
                const oldNext = parentBlock.next;
                parentBlock.next = childBlock.id;
                
                childBlock.x = parentBlock.x;
                childBlock.y = parentBlock.y + parentBlock.h;
                
                // If we displaced a block, maybe attach it to the bottom of the new child?
                // Only if the new child supports a next
                if (oldNext && childBlock.template.hasNext) {
                    childBlock.next = oldNext;
                    // We'd need to recursively move the old chain down, 
                    // but the render loop handles position relative to parent usually? 
                    // No, we store absolute positions. We need to shift the chain.
                    shiftChain(oldNext, childBlock.x, childBlock.y + childBlock.h);
                }
                
                snapped = true;
            }
        });
    }

    function shiftChain(rootId, startX, startY) {
        let currId = rootId;
        let cX = startX;
        let cY = startY;

        while (currId) {
            const b = getBlockById(currId);
            if (!b) break;
            b.x = cX;
            b.y = cY;
            
            cY += b.h;
            currId = b.next;
        }
    }

    function editBlockParams(block) {
        if (!block.params || Object.keys(block.params).length === 0) return;
        
        let promptText = `Edit parameters for ${block.type}:\n`;
        // Build JSON-like string for editing
        // In a real app, this would be a nice modal. 
        // For this version, we use multiple prompts or a parseable string.
        
        const jsonStr = JSON.stringify(block.params);
        const input = prompt(promptText + "Modify JSON:", jsonStr);
        
        if (input) {
            try {
                block.params = JSON.parse(input);
                generateLua();
            } catch (e) {
                alert("Invalid JSON format");
            }
        }
    }

    // --- Drawing Engine ---

    function gameLoop() {
        draw();
        requestAnimationFrame(gameLoop);
    }

    function draw() {
        // Clear Background
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid
        drawGrid();

        ctx.save();
        ctx.translate(camera.x, camera.y);
        ctx.scale(camera.zoom, camera.zoom);

        // Draw connections (lines between blocks if far apart - mostly for debugging, usually they touch)
        
        // Draw Blocks
        // We draw connected chains first to ensure Z-order is decent? 
        // Just simple loop is fine for now.
        blocks.forEach(drawBlock);

        ctx.restore();
    }

    function drawGrid() {
        const gridSize = 50 * camera.zoom;
        const offsetX = camera.x % gridSize;
        const offsetY = camera.y % gridSize;

        ctx.beginPath();
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 1;

        for (let x = offsetX; x < canvas.width; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
        }
        for (let y = offsetY; y < canvas.height; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
        }
        ctx.stroke();
    }

    function drawBlock(block) {
        const x = block.x;
        const y = block.y;
        const w = block.w;
        const h = block.h;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + 4, y + 4, w, h);

        // Body
        ctx.fillStyle = block.color;
        // Simple rounded rect path
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        // Top Notch (if hasPrev)
        if (block.template.hasPrev) {
            ctx.lineTo(x + 20, y);
            ctx.lineTo(x + 25, y + 5); // notch down
            ctx.lineTo(x + 30, y);
        } else {
            // Event block top (rounded)
            ctx.moveTo(x, y);
        }

        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        
        // Bottom Notch (if hasNext)
        if (block.template.hasNext) {
            ctx.lineTo(x + 30, y + h);
            ctx.lineTo(x + 25, y + h + 5); // notch protrusion
            ctx.lineTo(x + 20, y + h);
        }

        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Text
        ctx.fillStyle = 'black';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        
        let display = block.text;
        // Interpolate params into text
        if (block.params) {
            // Very simple replacement: replace matching keys if found in text, 
            // e.g. "screen.setColor(r, g...)" -> "screen.setColor(255, 255...)"
            // But since our text is generic, we construct a preview string
            
            if (block.type === 'setColor') {
                display = `setColor(${block.params.r},${block.params.g},${block.params.b},${block.params.a})`;
                // Show color swatch
                ctx.fillStyle = `rgba(${block.params.r},${block.params.g},${block.params.b},${block.params.a/255})`;
                ctx.fillRect(x + w - 30, y + 5, 20, 20);
                ctx.strokeStyle = 'white';
                ctx.strokeRect(x + w - 30, y + 5, 20, 20);
                ctx.fillStyle = 'black'; // reset
            } 
            else if (block.type === 'drawRect') {
                display = `Rect(${block.params.x},${block.params.y},${block.params.w},${block.params.h})`;
            }
            else if (block.type === 'if') {
                display = `If ${block.params.condition} then`;
            }
            else if (block.type === 'varSet') {
                display = `${block.params.name} = ${block.params.val}`;
            }
        }
        
        ctx.fillText(display, x + 10, y + h / 2);
    }

    // --- Importer (Canvas API -> Codeblocks) ---
    
    document.getElementById('import_canvas_file').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const shapes = JSON.parse(e.target.result);
                importShapesToBlocks(shapes);
                document.getElementById('import_status').innerText = "Loaded: " + file.name;
                document.getElementById('import_status').style.color = "#4CAF50";
            } catch (err) {
                alert("Error parsing file. Ensure it is a valid JSON export from the Canvas tool.");
                console.error(err);
            }
        };
        reader.readAsText(file);
    });

    function importShapesToBlocks(shapes) {
        // Clear existing blocks
        blocks = [];
        
        // Create Root Node
        let lastBlock = addBlock('onDraw', 50, 50);
        let startX = 50;
        let currentY = 50 + BLOCK_HEIGHT;

        let lastColor = {r:0, g:0, b:0, a:255}; // Default SW color state? Usually white actually.
        // But we force a set color at start to be safe.

        shapes.forEach(shape => {
            // 1. Handle Color Change
            const rgb = hexToRgb(shape.color);
            const a = shape.alpha !== undefined ? parseInt(shape.alpha) : 255;
            
            if (rgb.r !== lastColor.r || rgb.g !== lastColor.g || rgb.b !== lastColor.b || a !== lastColor.a) {
                const colorBlock = addBlock('setColor', startX, currentY, {r: rgb.r, g: rgb.g, b: rgb.b, a: a});
                lastBlock.next = colorBlock.id;
                lastBlock = colorBlock;
                currentY += BLOCK_HEIGHT;
                lastColor = {r: rgb.r, g: rgb.g, b: rgb.b, a: a};
            }

            // 2. Handle Shape
            let newBlock = null;
            if (shape.tool === 'rect') {
                // Adjust for SW drawRect (w-1, h-1 done in Lua, here we keep raw or adjust?)
                // The canvas export usually has x1, y1, w, h
                newBlock = addBlock('drawRect', startX, currentY, {x: shape.x1, y: shape.y1, w: shape.w, h: shape.h});
            } else if (shape.tool === 'rectF') {
                newBlock = addBlock('drawRectF', startX, currentY, {x: shape.x1, y: shape.y1, w: shape.w, h: shape.h});
            } else if (shape.tool === 'line') {
                newBlock = addBlock('drawLine', startX, currentY, {x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2});
            } else if (shape.tool === 'circle') {
                newBlock = addBlock('drawCircle', startX, currentY, {x: shape.x1, y: shape.y1, r: shape.radius});
            } else if (shape.tool === 'text') {
                newBlock = addBlock('drawText', startX, currentY, {x: shape.x1, y: shape.y1, text: shape.text || "text"});
            }

            if (newBlock) {
                lastBlock.next = newBlock.id;
                lastBlock = newBlock;
                currentY += BLOCK_HEIGHT;
            }
        });

        generateLua();
    }

    function hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 255 };
    }

    // --- Lua Generation ---

    function generateLua() {
        let lua = "-- Generated by Mr Lennyn's Codeblock Editor\n\n";
        
        // Find all Event blocks (roots)
        const roots = blocks.filter(b => b.template.type === 'event');
        
        roots.forEach(root => {
            lua += root.text + "\n"; // function onDraw()
            
            let currentId = root.next;
            let indent = "    ";
            
            // Traverse chain
            // Note: This simple traversal doesn't handle nested 'end' blocks perfectly for standard linked lists
            // For 'if' blocks, we need to track depth. 
            // In this linear linked list model, 'if' -> content -> 'end' -> next.
            
            while(currentId) {
                const b = getBlockById(currentId);
                if (!b) break;

                if (b.type === 'end') {
                    indent = indent.substring(0, indent.length - 4);
                }

                lua += indent + getLuaLine(b) + "\n";

                if (b.type === 'if' || b.type === 'else' || b.type === 'clickDetect') {
                    indent += "    ";
                }
                
                currentId = b.next;
            }
            
            lua += "end\n\n";
        });

        outputArea.value = lua;
        charCountLabel.innerText = lua.length;
    }

    function getLuaLine(b) {
        const p = b.params;
        switch(b.type) {
            case 'setColor': return `screen.setColor(${p.r}, ${p.g}, ${p.b}, ${p.a})`;
            case 'drawRect': return `screen.drawRect(${p.x}, ${p.y}, ${p.w}, ${p.h})`;
            case 'drawRectF': return `screen.drawRectF(${p.x}, ${p.y}, ${p.w}, ${p.h})`;
            case 'drawLine': return `screen.drawLine(${p.x1}, ${p.y1}, ${p.x2}, ${p.y2})`;
            case 'drawCircle': return `screen.drawCircle(${p.x}, ${p.y}, ${p.r})`;
            case 'drawText': return `screen.drawText(${p.x}, ${p.y}, "${p.text}")`;
            case 'if': return `if ${p.condition} then`;
            case 'else': return `else`;
            case 'end': return `end`;
            case 'varSet': return `${p.name} = ${p.val}`;
            case 'math': return `${p.op}`;
            
            // Logic Sugar: Click Detect
            // Generates: if isPressed and x > ... then
            case 'clickDetect': 
                return `if input.getBool(1) and input.getNumber(3) > ${p.x} and input.getNumber(3) < ${parseInt(p.x)+parseInt(p.w)} and input.getNumber(4) > ${p.y} and input.getNumber(4) < ${parseInt(p.y)+parseInt(p.h)} then`;
            
            default: return `-- unknown block ${b.type}`;
        }
    }

    // --- Helpers ---
    document.getElementById('clear_canvas').addEventListener('click', () => {
        if(confirm("Clear all blocks?")) {
            blocks = [];
            addBlock('onDraw', 50, 50);
            draw();
            generateLua();
        }
    });

    document.getElementById('save_project').addEventListener('click', () => {
        const data = JSON.stringify(blocks);
        const blob = new Blob([data], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stormworks_codeblocks.json';
        a.click();
    });

    document.getElementById('load_project').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            blocks = JSON.parse(e.target.result);
            draw();
            generateLua();
        };
        reader.readAsText(file);
    });

    document.getElementById('copy_code').addEventListener('click', () => {
        outputArea.select();
        document.execCommand('copy');
    });

    // Start
    init();
});
