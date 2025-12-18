class TransformerLogger {
    constructor() {
        this.logs = [];
    }

    /**
     * @param {number} severity - 1=Info, 2=Warn, 3=Error
     * @param {number} category - 1=Link, 2=XML-Structure, 3=Symbol
     * @param {string} errorMsgKey - Message key from messages.json
     * @param {string} reference - Context { customerId, text, position }
     */
    log(severity, category, errorMsgKey, reference = "") {
        this.logs.push({
            severity,
            category,
            errorMsg: errorMsgKey,
            reference
        });
    }

    // Convenience methods
    info(category, errorMsgKey, reference) {
        this.log(TransformerLogger.SEVERITY.INFO, category, errorMsgKey, reference);
    }
    warn(category, errorMsgKey, reference) {
        this.log(TransformerLogger.SEVERITY.WARN, category, errorMsgKey, reference);
    }

    error(category, errorMsgKey, reference) {
        this.log(TransformerLogger.SEVERITY.ERROR, category, errorMsgKey, reference);
    }

    getLogs() {
        return this.logs;
    }

    clear() {
        this.logs = [];
    }

    // Constants
    static get SEVERITY() {
        return {
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };
    }

    static get CATEGORY() {
        return {
            LINK: 1,
            XML_STRUCTURE: 2,
            CONTENT: 3
        };
    }
}

module.exports = TransformerLogger;
