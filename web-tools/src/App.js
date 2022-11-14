import './App.css';
import Terminal, { ColorMode, TerminalOutput } from 'react-terminal-ui';
import {useState, useEffect, useRef} from "react";
import {createFFmpeg} from '@ffmpeg/ffmpeg';


function findNonEqual(items, value) {
    const n = items.length;
    for (let i = 0; i < n; ++i) {
        if (items[i] !== value) {
            return i;
        }
    }
    return n;
}


function findNonEqualBackwards(items, value) {
    let n = items.length;
    while (n > 0) {
        --n;
        if (items[n] !== value) {
            return n; 
        }
    }
    return n;
}


function arrayBack(a) {
    return a[a.length - 1];
}


function pathNormalize(path) {
    let pathComponents = path.split("/");
    let n = pathComponents.length;
    let results = [];
    for (let i = 0; i < n; ++i) {
        const p = pathComponents[i];
        if (p === "..") {
            if (results.length > 0 && arrayBack(results) !== ".") {
                results.pop();
            } else {
                results.push("..");
            }
        } else if (p === "") {

        } else if (p !== "." || i === 0) {
           results.push(p); 
        }
    }
    if (results.length === 0) return "";
    if (arrayBack(results) === "." && results.length > 1) results.pop();
    let result = results.join("/");
    return result || "/";
}


function pathJoin(x, y, z) {
    x = x.slice(0, findNonEqualBackwards(x, "/") + 1);

    y = y.slice(0, findNonEqualBackwards(y, "/") + 1);
    y = y.slice(findNonEqual(y, "/"), y.length);

    if (x === "/") x = "";

    let result = "";
    if (z === undefined) {
        result = `${x}/${y}`;
    } else {
        console.log(z);
        z = z.slice(0, findNonEqualBackwards(z, "/") + 1);
        z = z.slice(findNonEqual(z, "/"), z.length);
        result = `${x}/${y}/${z}`;
    }
    result = result.slice(0, findNonEqualBackwards(result, "/") + 1);
    return result;
}


export function pathJoinArray(items) {
    let pathComponents = [];
    const n = items.length;
    if (n === 0) return "";
    let path = items[0];
    path = path.slice(0, findNonEqualBackwards(items, "/") + 1);
    pathComponents.push(path);
     
    for (let i = 1; i < n; ++i) {
        path = items[i];
        path = path.slice(0, findNonEqualBackwards(items, "/") + 1);
        path = path.slice(findNonEqual(items, "/"), items.length);
        pathComponents.push(path);
    }
    let result = pathComponents.join("/");
    return result.slice(0, findNonEqualBackwards(result, "/") + 1);
}

function getFilename(x) {
    const r = x.split("/");
    return r[r.length - 1];
}

class Syscalls {
    constructor(ffmpeg, stdout, stderr, statusCode, pwd, downloader) {
        this.ffmpeg = ffmpeg;
        this.stdout = stdout;
        this.stderr = stderr;
        this.statusCode = statusCode;
        this.pwd = pwd;
        this.downloader = downloader;
        this.home = "/home/web_user";
        this.lock = false;
    }

    download(path) {
        const pathToFile = pathJoin(this.pwd.path, path);
        let data = this.ffmpeg.current.FS("readFile", pathToFile);
        let blob = new Blob([data]);
        let filename = getFilename(pathToFile);
        let url = URL.createObjectURL(blob);
        this.downloader(filename, url);
    }

    start() {
        this.lock = true;
    }

    done() {
        this.lock = false;
    }

    ready() {
        return this.ffmpeg.current !== null;
    }

    isFile(mode) {
        return this.ffmpeg.current.FS("isFile", mode.toString());
    }

    isDir(mode) {
        return mode === 16895;
    }

    stat(path) {
        return this.ffmpeg.current.FS("stat", path.toString());
    }

    ls(path) {
        if (path === undefined) {
            path = ".";
        }
        return this.ffmpeg.current.FS("readdir", path);
    }

    lsDetailed(path) {
        return this.ls(path).map(name => {
            let pathToResource = pathJoin(this.pwd.path, path, name);     
            let stat = this.stat(pathToResource);
            stat["name"] = name;
            stat["path"] = pathToResource;
            stat["root"] = path;
            return stat;
        });
    }

    lsFullPath(path) {
        return this.ls(path).map(name => pathJoin(this.pwd.path, path, name));
    } 

    mkdir(path) {
        
    }

    async upload(fp) {
        if (fp === undefined) return;
        let buffer = await fp.arrayBuffer(); 
        let data = new Uint8Array(buffer);
        this.ffmpeg.current.FS("writeFile", pathJoin(this.pwd.path, fp.name.replace(" ", "_")), data);
    }
};


function commandDownload(syscalls, command) {
    let commandComponents = command.split(" ");
    syscalls.download(commandComponents[1]);
}

function commandUnknown(syscalls, command) {
    syscalls.stdout(`Uknown command: ${command}`);
}

function commandLs(syscalls, command) {
    let path = ".";
    let commandComponents = command.split(" ");
    if (commandComponents.length > 1) {
        path = commandComponents[1];
    }
    if (path[0] === "~") {
        path = pathJoin(syscalls.home, path);
    } else if (path[0] !== "/") {
        path = pathJoin(syscalls.pwd.path, path);
    }

    let items = syscalls.ls(path);
    syscalls.stdout(items.join(" "));

}

function commandCd(syscalls, command) {
    let path = ".";
    let commandComponents = command.split(" ");
    if (commandComponents.length > 1) {
        path = commandComponents[1];
    }
    if (path[0] === "~") {
        path = pathJoin(syscalls.home, path.slice(1, path.length));
    }

    if (path === ".") {
        return;
    }

    if (path === "..") {
        if (syscalls.pwd.path === "/") {
            syscalls.stderr("cd: root doesn't have parent folder");
        } else {
            syscalls.pwd.setPath(pathNormalize(pathJoin(syscalls.pwd.path, "..")));
        }
    } else {
        try {
            let fullPath = path;
            if (path[0] !== "/") {
                console.log("pwd", syscalls.pwd);
                fullPath = pathNormalize(pathJoin(syscalls.pwd.path, path));
            }

            let stat = syscalls.stat(fullPath);
            console.log(stat)
            if (syscalls.isDir(stat["mode"])) {
                syscalls.pwd.setPath(fullPath);
            } else {
                syscalls.stderr(`cd: not a directory: ${path}`);
            }
        } catch (e) {
            console.error(e)
            syscalls.stderr(`cd: no such file or directory: ${path}`);
        }
    }
}


async function commandFfmpeg(syscalls, command) {
    let commandItems = command.split(" ");
    commandItems = commandItems.slice(1, commandItems.length);
    syscalls.ffmpeg.current.setLogger(x => {
        if (x.type === "ffout") {
            syscalls.stdout(x.message);
        }
        if (x.type === "fferr") {
            syscalls.stderr(x.message);
        }
        console.log(x)
    });
    if (!commandItems.includes("-y")) {
        commandItems.push("-y");
    }
    if (!commandItems.includes("-nostdin")) {
        commandItems.push("-nostdin");
    }

    syscalls.start();
    try {
        await syscalls.ffmpeg.current.run(...commandItems);
    } catch(e) { console.error(e); alert(e); }
    syscalls.done();
}


function print(lines, setLines) {
    return line => {
        if (lines.length === 0) {
            lines = [line];
        } else {
            const lineLast = lines[lines.length - 1];
            if (lineLast.includes("\r")) {
                lines = lines.slice(0, lines.length - 1);
            } else {
                lines = lines.slice();
            }
            lines.push(line);
        }
        setLines(lines);
    };
}

function initState(state) {
    async function f() {
        if (state.outputLineId === 0) {
            state.setOutputLineId(1); 
            let ffmpeg = createFFmpeg({log: true});
            await ffmpeg.load();

            state.ffmpegRef.current = ffmpeg;
            state.setTerminalLines(state.messages);
        }
    }
    f();
}


function onInputCommand(syscalls, commands) {
    return commandText => {
        const commandComponents = commandText.split(" ");
        if (!syscalls.ready()) {
            syscalls.stderr("Wait till syscalls are ready");
            return;
        }

        if (commandComponents.length === 0 || commandText === "") {
            return;
        }

        const command = commands[commandComponents[0]] || commandUnknown;
        syscalls.stdout(`$ ${commandText}`);
        command(syscalls, commandText);
    };
}


const commands = {
    "ls": commandLs,
    "cd": commandCd,
    "ffmpeg": commandFfmpeg,
    "download": commandDownload,
};


function App(props) {
    const [outputLineId, setOutputLineId] = useState(0);
    const [terminalLines, setTerminalLines] = useState(["Loading..."]);
    const [pwd, setPwd] = useState("/");
    const [statusCode, setStatusCode] = useState(0);
    const [fileName, setFileName] = useState("");
    const [download, setDownload] = useState({"url": "", "name": ""});

    let ffmpegRef = useRef(null);
    let downloadRef = useRef(null);

    const stdout = print(terminalLines, setTerminalLines);
    const stderr = stdout;

    let statusCodeController = {"statusCode": statusCode, "setStatusCode": setStatusCode};
    let pwdController = {"path": pwd, "setPath": setPwd};

    const downloader = (name, url) => {
        setDownload({"name": name, "url": url});
    };

    let syscalls = new Syscalls(ffmpegRef, stdout, stderr, statusCodeController, pwdController, downloader);

    const messages = ["ffmpeg -i input.mp4 output.wav"];
    const terminalName = `web-tools: ${pwd}`;

    useEffect(
        () => initState({
            "outputLineId": outputLineId,
            "setOutputLineId": setOutputLineId,
            "setTerminalLines": setTerminalLines,
            "ffmpegRef": ffmpegRef,
            "messages": messages
        }),
        [outputLineId, setOutputLineId, setTerminalLines, ffmpegRef, messages]
    );

    useEffect(
        () => {
            if (download.url !== "")
                downloadRef.current.click()
        },
        [download.url]
    );

    const onFileChange = event => setFileName(event.target.files[0]);
    const onFileUpload = async event => syscalls.upload(fileName);

    return (
        <div className="container">
            <Terminal name={terminalName} colorMode={ColorMode.Light}  onInput={onInputCommand(syscalls, commands)}>
                { terminalLines.map((x, i) => <TerminalOutput key={i}>{x}</TerminalOutput>)}
            </Terminal>
            <div>
                <input type="file" onChange={onFileChange} />
                <button onClick={onFileUpload}>Upload</button>
                <a style={{"display": "none"}} ref={downloadRef} href={download.url} target="_blank" download={download.name} rel="noreferrer">{download.name}</a>
            </div>
        </div>
    )
}

export default App;
