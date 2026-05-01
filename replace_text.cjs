const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'src', 'components');

const replacements = {
    "CONFLICT_TERMINAL": "CONFLICT TERMINAL",
    "INITIATE_MATCHMAKING": "INITIATE MATCHMAKING",
    "SEARCHING_FOR_OPPONENT...": "SEARCHING FOR OPPONENT...",
    "ABORT_SEQUENCE": "ABORT SEQUENCE",
    "Return_to_Dashboard": "RETURN TO DASHBOARD",
    "RETURN_TO_BASE": "RETURN TO BASE",
    "SIGNAL_HOSTILE // ELIMINATION_TARGET": "SIGNAL HOSTILE // ELIMINATION TARGET",
    "SIGNAL_FRIENDLY // CORE_SYNC": "SIGNAL FRIENDLY // CORE SYNC",
    "SEC_${l}-${r}": "SEC ${l}-${r}",
    "AWAITING_SYNC_5_DP": "AWAITING SYNC 5 DP",
    "INSPECT_TARGET": "INSPECT TARGET",
    "DEPLOY_TARGET": "DEPLOY TARGET",
    "ESTABLISH_NEURAL_LINK": "ESTABLISH NEURAL LINK",
    "INITIALISE_SESSION": "INITIALISE SESSION",
    "PROCEED_NEXT_PHASE": "PROCEED NEXT PHASE",
    "ENTER_ID": "ENTER ID",
    "COMMAND_TERMINAL": "COMMAND TERMINAL",
    "COMBAT_SIMULATION": "COMBAT SIMULATION",
    "CONFLICT_ZONE": "CONFLICT ZONE",
    "PERSONNEL_ARCHIVE": "PERSONNEL ARCHIVE",
    "RECRUITMENT_NODE": "RECRUITMENT NODE",
    "LOGISTICS_TERMINAL": "LOGISTICS TERMINAL",
    "AUTHORIZING_": "AUTHORIZING ",
    "AUTHENTICATING_": "AUTHENTICATING ",
    "CONNECTION_ESTABLISHED": "CONNECTION ESTABLISHED",
    "SYSTEM_READY": "SYSTEM READY",
    "TUTORIAL_MODE": "TUTORIAL MODE",
    "DEPLOY_UNIT": "DEPLOY UNIT",
    "Return to Dashboard": "RETURN TO DASHBOARD",
    "Return_to_base": "RETURN TO BASE"
};

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            
            for (const [key, value] of Object.entries(replacements)) {
                if (content.includes(key)) {
                    content = content.split(key).join(value);
                    modified = true;
                }
            }
            
            if (modified) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated ${file}`);
            }
        }
    }
}

processDirectory(directoryPath);
console.log('Text string replacements completed.');
