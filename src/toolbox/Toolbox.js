import { useState } from 'react';
import { convertImage, convertableImageFormats, getOutputFormats } from "./fileConversions";

import "../styles/toolbox.css";

export default function Toolbox() {
    const [outputFormat, setOutputFormat] = useState("png");
    const [blob, setBlob] = useState(null);
    const [fileName, setFileName] = useState("converted")
    const [outputFormats, setOutputFormats] = useState([])

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const inputFormat = file.type;
        setFileName(file.name)
        setOutputFormats(getOutputFormats(outputFormat))

        try {
            const resultBlob = await convertImage(file, inputFormat, outputFormat);
            setBlob(resultBlob);
        } catch (err) {
            console.error(err);
        }
    };

    const handleDownload = () => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileName}.${outputFormat}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div
            className="toolbox"
            style={{ padding: "1rem" }}
        >
            <div
                className='file-conversion'
            >
                <h2>convert image</h2>
                <input type="file" accept={convertableImageFormats.map(f => `.${f}`)} onChange={handleFileChange} />
                <div style={{ marginBottom: "0.5rem" }}>
                    <label>
                        output format:{" "}
                        <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)}>
                            {outputFormats.map(f =>
                                <option key={f} value={`${f}`}>{`${f}`}</option>)
                            }
                        </select>
                    </label>
                </div>

                {blob && (
                    <div style={{ marginTop: "1rem" }}>
                        <button
                            className='download-file-button'
                            onClick={handleDownload}
                        >
                            Download
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}