import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { event_types, eventSource } from "../../../../script.js";

const extensionName = "context-token-counter";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: false
};

let lastTokenCount = 0;

function updateCounterVisibility() {
    const counter = $("#context-token-counter-display");
    const isEnabled = extension_settings[extensionName].enabled;
    
    if (isEnabled) {
        counter.attr("style", "display: block !important;");
        updateTokenCount();
    } else {
        counter.attr("style", "display: none !important;");
    }
}

function updateTokenCount() {
    const context = getContext();
    
    let usedTokens = lastTokenCount;
    let maxTokens = context.maxContext || 8192;
    
    // Try to get from generation_cost global if it exists
    if (typeof generation_cost !== 'undefined' && generation_cost > 0) {
        usedTokens = generation_cost;
        console.log(`[${extensionName}] Got tokens from generation_cost: ${usedTokens}`);
    }
    
    // Try to count messages manually as fallback
    if (usedTokens === 0 && context.chat && context.chat.length > 0) {
        // Rough estimate: ~4 chars per token
        let totalChars = 0;
        context.chat.forEach(msg => {
            if (msg.mes) {
                totalChars += msg.mes.length;
            }
        });
        usedTokens = Math.floor(totalChars / 4);
        console.log(`[${extensionName}] Estimated from char count: ${usedTokens} tokens`);
    }
    
    const remainingTokens = maxTokens - usedTokens;
    const percentageUsed = (usedTokens / maxTokens) * 100;
    
    console.log(`[${extensionName}] Display: ${usedTokens} / ${maxTokens} (${percentageUsed.toFixed(1)}%)`);
    
    $("#context-counter-value").text(`${usedTokens} / ${maxTokens}`);
    $("#context-counter-remaining").text(`${remainingTokens} remaining`);
    
    const barFill = $(".counter-bar-fill");
    barFill.css("width", `${percentageUsed}%`);
    
    barFill.removeClass("warning danger");
    if (percentageUsed >= 90) {
        barFill.addClass("danger");
    } else if (percentageUsed >= 75) {
        barFill.addClass("warning");
    }
}

function onEnabledChange(event) {
    const value = $(event.target).prop("checked");
    extension_settings[extensionName].enabled = value;
    saveSettingsDebounced();
    updateCounterVisibility();
}

// Hook into generation to capture token info
function onGenerationData(data) {
    console.log(`[${extensionName}] Generation data:`, data);
    
    // Try to extract token count from various possible fields
    if (data && typeof data === 'object') {
        lastTokenCount = data.token_count || 
                        data.tokens || 
                        data.prompt_tokens ||
                        data.total_tokens ||
                        lastTokenCount;
        
        if (lastTokenCount > 0) {
            console.log(`[${extensionName}] Updated token count: ${lastTokenCount}`);
            updateTokenCount();
        }
    }
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);
    
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }
    
    const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
    $("#extensions_settings2").append(settingsHtml);
    
    const counterHtml = await $.get(`${extensionFolderPath}/counter.html`);
    $("body").append(counterHtml);
    
    $("#context_counter_enabled").prop("checked", extension_settings[extensionName].enabled);
    $("#context_counter_enabled").on("input", onEnabledChange);
    
    // Make counter draggable
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    $("#context-token-counter-display").on("mousedown", function(e) {
        isDragging = true;
        $(this).addClass("dragging");
        
        const rect = this.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
        
        e.preventDefault();
    });

    $(document).on("mousemove", function(e) {
        if (isDragging) {
            const counter = $("#context-token-counter-display");
            const newLeft = e.clientX - dragOffsetX;
            const newTop = e.clientY - dragOffsetY;
            
            // Keep within viewport bounds
            const maxLeft = window.innerWidth - counter.outerWidth();
            const maxTop = window.innerHeight - counter.outerHeight();
            
            const boundedLeft = Math.max(0, Math.min(newLeft, maxLeft));
            const boundedTop = Math.max(0, Math.min(newTop, maxTop));
            
            counter.css({
                left: boundedLeft + "px",
                top: boundedTop + "px",
                right: "auto",
                bottom: "auto"
            });
        }
    });

    $(document).on("mouseup", function() {
        if (isDragging) {
            isDragging = false;
            $("#context-token-counter-display").removeClass("dragging");
        }
    });
    
    // Listen for various events
    eventSource.on(event_types.MESSAGE_RECEIVED, updateTokenCount);
    eventSource.on(event_types.MESSAGE_SENT, updateTokenCount);
    eventSource.on(event_types.CHAT_CHANGED, updateTokenCount);
    eventSource.on(event_types.GENERATION_ENDED, onGenerationData);
    
    updateCounterVisibility();
    
    console.log(`[${extensionName}] Loaded successfully`);
});