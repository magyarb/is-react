import React, {Component} from 'react';
import './App.css';
import PropTypes from 'prop-types';
import {findDOMNode} from 'react-dom';
import BarcodeReader from 'JOB-master';
import zxing from "instascan/src/zxing.js";

const ZXing = zxing();

function hasGetUserMedia() {
    return !!(navigator.getUserMedia || navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia || navigator.msGetUserMedia);
}

class App extends Component {
    static defaultProps = {
        audio: false,
        className: '',
        height: 480,
        muted: false,
        onUserMedia: () => {
        },
        screenshotFormat: 'image/webp',
        width: 640,
    };

    static propTypes = {
        audio: PropTypes.bool,
        muted: PropTypes.bool,
        onUserMedia: PropTypes.func,
        height: PropTypes.oneOfType([
            PropTypes.number,
            PropTypes.string,
        ]),
        width: PropTypes.oneOfType([
            PropTypes.number,
            PropTypes.string,
        ]),
        screenshotFormat: PropTypes.oneOf([
            'image/webp',
            'image/png',
            'image/jpeg',
        ]),
        style: PropTypes.object,
        className: PropTypes.string,
        audioSource: PropTypes.string,
        videoSource: PropTypes.string,
    };

    static mountedInstances = [];

    static userMediaRequested = false;

    constructor() {
        super();
        this.state = {
            hasUserMedia: false,
        };
        setInterval(function () {
            this.getScan();
        }.bind(this), 200); //here you can set the zxing interval

    }

    componentDidMount() {
        if (!hasGetUserMedia()) return;

        App.mountedInstances.push(this);

        if (!this.state.hasUserMedia && !App.userMediaRequested) {
            this.requestUserMedia();
        }
        this._analyzer = new Analyzer(this.video);


        BarcodeReader.Init();
        BarcodeReader.StreamCallback = function (result) {
            if (result.length > 0) {
                console.log(result[0].Value);
            }
        };
        BarcodeReader.DecodeStream(this.video);
    }

    componentWillUnmount() {
        const index = App.mountedInstances.indexOf(this);
        App.mountedInstances.splice(index, 1);

        if (App.mountedInstances.length === 0 && this.state.hasUserMedia) {
            if (this.stream.stop) {
                this.stream.stop();
            } else {
                if (this.stream.getVideoTracks) {
                    this.stream.getVideoTracks().map(track => track.stop());
                }
                if (this.stream.getAudioTracks) {
                    this.stream.getAudioTracks().map(track => track.stop());
                }
            }
            App.userMediaRequested = false;
            window.URL.revokeObjectURL(this.state.src);
        }
    }

    getScan() {
        if (!this.state.hasUserMedia) return null;
        const canvas = this.getCanvas();
        let analysis = this._analyzer.analyze();
        if (!analysis) {
            return null;
        }
        else {
            //here you can extract the qr result
            console.log(analysis.result);
        }

        return null;
    }

    getCanvas() {
        const video = findDOMNode(this.video);

        if (!this.state.hasUserMedia || !video.videoHeight) return null;

        if (!this.ctx) {
            const canvas = document.createElement('canvas');
            const aspectRatio = video.videoWidth / video.videoHeight;

            canvas.width = video.clientWidth;
            canvas.height = video.clientWidth / aspectRatio;

            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
        }

        const {ctx, canvas} = this;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        return canvas;
    }

    requestUserMedia() {
        navigator.getUserMedia = navigator.getUserMedia ||
            navigator.webkitGetUserMedia ||
            navigator.mozGetUserMedia ||
            navigator.msGetUserMedia;

        const sourceSelected = (audioSource, videoSource) => {
            const constraints = {
                video: {
                    optional: [{sourceId: videoSource}],
                },
            };

            if (this.props.audio) {
                constraints.audio = {
                    optional: [{sourceId: audioSource}],
                };
            }

            navigator.getUserMedia(constraints, (stream) => {
                App.mountedInstances.forEach(instance => instance.handleUserMedia(null, stream));
            }, (e) => {
                App.mountedInstances.forEach(instance => instance.handleUserMedia(e));
            });
        };

        if (this.props.audioSource && this.props.videoSource) {
            sourceSelected(this.props.audioSource, this.props.videoSource);
        } else if ('mediaDevices' in navigator) {
            navigator.mediaDevices.enumerateDevices().then((devices) => {
                let audioSource = null;
                let videoSource = null;

                devices.forEach((device) => {
                    if (device.kind === 'audio') {
                        audioSource = device.id;
                    } else if (device.kind === 'video') {
                        videoSource = device.id;
                    }
                });
                sourceSelected(audioSource, videoSource);
            })
                .catch((error) => {
                    console.log(`${error.name}: ${error.message}`); // eslint-disable-line no-console
                });
        } else {
            MediaStreamTrack.getSources((sources) => {
                let audioSource = null;
                let videoSource = null;

                sources.forEach((source) => {
                    if (source.kind === 'audio') {
                        audioSource = source.id;
                    } else if (source.kind === 'video') {
                        videoSource = source.id;

                    }
                });

                sourceSelected(audioSource, videoSource);
            });
        }

        App.userMediaRequested = true;
    }

    handleUserMedia(error, stream) {
        if (error) {
            this.setState({
                hasUserMedia: false,
            });

            return;
        }
        try {
            const src = window.HTMLMediaElement.srcObject(stream);

            this.stream = stream;
            this.setState({
                hasUserMedia: true,
                src,
            });

            this.props.onUserMedia();
        } catch (error) {
            this.stream = stream;
            this.video.srcObject = stream;
            this.setState({
                hasUserMedia: true
            });
        }
    }

    render() {
        return (
            <div id={'container'}>
                <video
                    autoPlay
                    width={this.props.width}
                    height={this.props.height}
                    src={this.state.src}
                    muted={this.props.muted}
                    className={this.props.className}
                    style={this.props.style}
                    ref={ref => this.video = ref}
                />
            </div>
        );
    }
}

class Analyzer {
    constructor(video) {
        this.video = video;

        this.imageBuffer = null;
        this.sensorLeft = null;
        this.sensorTop = null;
        this.sensorWidth = null;
        this.sensorHeight = null;

        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'none';
        this.canvasContext = null;

        this.decodeCallback = ZXing.Runtime.addFunction(function (ptr, len, resultIndex, resultCount) {
            let result = new Uint8Array(ZXing.HEAPU8.buffer, ptr, len);
            let str = String.fromCharCode.apply(null, result);
            if (resultIndex === 0) {
                window.zxDecodeResult = '';
            }
            window.zxDecodeResult += str;
        });

    }

    analyze() {
        if (!this.video.videoWidth) {
            return null;
        }

        if (!this.imageBuffer) {
            let videoWidth = this.video.videoWidth;
            let videoHeight = this.video.videoHeight;

            this.sensorWidth = videoWidth;
            this.sensorHeight = videoHeight;
            this.sensorLeft = Math.floor((videoWidth / 2) - (this.sensorWidth / 2));
            this.sensorTop = Math.floor((videoHeight / 2) - (this.sensorHeight / 2));

            this.canvas.width = this.sensorWidth;
            this.canvas.height = this.sensorHeight;

            this.canvasContext = this.canvas.getContext('2d');
            this.imageBuffer = ZXing._resize(this.sensorWidth, this.sensorHeight);
            return null;
        }

        this.canvasContext.drawImage(
            this.video,
            this.sensorLeft,
            this.sensorTop,
            this.sensorWidth,
            this.sensorHeight
        );

        let data = this.canvasContext.getImageData(0, 0, this.sensorWidth, this.sensorHeight).data;
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            let [r, g, b] = [data[i], data[i + 1], data[i + 2]];
            ZXing.HEAPU8[this.imageBuffer + j] = Math.trunc((r + g + b) / 3);
        }
        try {
            let err = ZXing._decode_qr(this.decodeCallback);

            if (err) {
                return null;
            }
        }
        catch (err) {
            console.log(err);
        }

        let result = window.zxDecodeResult;
        if (result != null) {
            return {result: result, canvas: this.canvas};
        }

        return null;
    }
}

export default App;
