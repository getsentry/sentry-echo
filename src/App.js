import React, { Component } from 'react';
import Tone from 'tone';
import classNames from 'classnames';
import anime from 'animejs';
import AnimatedNumber from 'react-animated-number';
import lodash from 'lodash';
import './index.scss';

const platforms = [
  'javascript',
  'node',
  'python',
  'ruby',
  'cocoa',
  'csharp',
  'elixir',
  'go',
  'java',
  'objc',
  'php',
  'perl',
  'c',
  'other',
];

// Startup the tone transport. We start the transport a bit in the future since
// we won't have a sequence to fire until we build the fisrt sequence.
Tone.Transport.start('+1');

// Default BPM
Tone.Transport.bpm.value = 160;

// Put Tone on the window for debuggin purposes
window.Tone = Tone;

const instrumentGroups = [
  'Lead Synth',
  'Kick Drum',
  'Bass Line',
];

const scale = [ 'C', 'D', 'E', 'F', 'G', 'A', 'B' ];

const defaultGrouping = [
  [ 'javascript', 'node', 'python', 'ruby' ],
  [ 'go', 'csharp', 'elixir', 'php' ],
  [ 'java', 'objc', 'c', 'other' ],
];

class SeqeuenceCanvas extends Component {
  makeBarGrid() {
    const widthPerBar = new Tone.Time('1:0:0')
      .div(this.props.sequenceSize)
      .mult(this.props.width)
      .toSeconds();

    const totalBars = Math.floor(this.props.width / widthPerBar)

    return lodash.times(totalBars, i => <line key={i}
      x1={Math.floor(widthPerBar * (i + 1))}
      x2={Math.floor(widthPerBar * (i + 1))}
      y1={0}
      y2={this.props.height} />);
  }

  makeNote(note) {
    const paddingX = 1;
    const paddingY = 2;

    const height = (this.props.height / scale.length) - (paddingY * 2);
    const rawWidth = note.length.clone()
      .div(this.props.sequenceSize)
      .mult(this.props.width)
      .toSeconds();

    // Notes may play for a very short period of time, but at least give them a
    // pixel representation
    const width = Math.max(1, rawWidth);

    const x = note.relTime.clone()
      .div(this.props.sequenceSize)
      .mult(this.props.width)
      .toSeconds() + paddingX;

    const y = Math.floor(note.scaleIndex * (this.props.height / scale.length)) + paddingY;

    return <rect key={note.time.toSeconds()}
      height={height}
      width={width}
      x={x}
      y={y} />
  }

  makePlaylist() {
    return this.props.playlist.map(n => this.makeNote(n));
  }

  render() {
    return <svg width={this.props.width} height={this.props.height}>
      <g className="bar-lines">
        {this.makeBarGrid()}
      </g>
      <g className="playlist">
        {this.makePlaylist()}
      </g>
    </svg>;
  }
}

SeqeuenceCanvas.defaultProps = {
  playlist: [],
};

class PlatformSequence extends Component {
  constructor() {
    super();

    this.state = {
      sequenceSize:  new Tone.Time('4:0:0'),
      playheadShown: false,

      countDivision: 5,
      noteLength:    '64n',
      quantizeTo:    '8n',
    };

    this.timeline = null;
    this.playhead = null;
    this.playheadAnim = null
    this.beatIndicator = null

    this.setPlayhead = this.setPlayhead.bind(this);
    this.processEvents = this.processEvents.bind(this);
    this.triggerNoteIndicator = this.triggerNoteIndicator.bind(this);
    this.updatePlaylist = this.updatePlaylist.bind(this);
  }

  componentDidMount() {
    const start = this.state.sequenceSize

    // Schedule repeating event sampling for this platform
    new Tone.Loop(this.processEvents, this.state.sequenceSize).start(start)
  }

  processEvents(time) {
    // XXX: This isn't great that we're directly mutating this here, probably
    // would be nicer to keep doing things in a react-esq way in which case
    // this *should* be immutable, but whatever, it's a hackweek project.
    let entries = this.props.eventBuffer[this.props.platform].sort()
    this.props.eventBuffer[this.props.platform] = [];

    // Normalize entry timestamps to seconds starting relative to the start of
    // the upcoming sequence.
    const earliestTime = entries[0];
    entries = entries.map(e => new Tone.Time((e - earliestTime) / 1000));

    // We compute where the notes land on the grid by [1] quantizing them onto
    // the grid based on the quantizeTo property, then determining how long the
    // note should last by [2] taking the number of events quantized to the
    // same time, [3] dividing that by the countDivision, and multiplying that
    // by the noteLength property.
    //
    // [4] Notes are moved up and down the scale when they would otherwise
    // overlap with another note before it's completed.

    // [1]: Quanitze error timestamps
    entries = entries.map(e => e.quantize(this.state.quantizeTo))

    // [2]: Group timestamps based on overlap
    const groups = Object.values(lodash.groupBy(entries, e => e.toSeconds()))

    // [3]: Offset the time and compute the note length
    entries = groups.map(e => ({
      relTime: e[0],
      time:    e[0].clone().add(time),
      length: new Tone.Time(e.length / this.state.countDivision).mult(this.state.noteLength),
    }));

    // Start at a random note. Maybe a good idea, maybe bad
    let scaleIndex = Math.floor(Math.random() * (scale.length - 1));
    entries[0].scaleIndex = scaleIndex;

    // [4]: Move notes through the scale if notes overlap nessicary
    for (let i = 1; i < entries.length; i++) {
      const curr = entries[i];
      const last = entries[i-1];

      const dir = [-1, 1][Math.floor(Math.random() * 2)];

      curr.scaleIndex = last.time.clone().add(last.length) > curr.time
        ? scaleIndex = Math.abs(scaleIndex + dir) % scale.length
        : scaleIndex;
    }

    // Schedule notes to be played
//    entries.forEach(n => {
//      const note = `${scale[n.scaleIndex]}${this.props.instrumentIndex}`;
//      this.props.synth.triggerAttackRelease(note, n.time, n.length);
//    });

    // Schedule beat-indicator triggers for each note
    entries.forEach(e => Tone.Draw.schedule(this.triggerNoteIndicator, e.time))

    // Schedule redrawing of the sequence grid and playhead
    Tone.Draw.schedule(_ => this.updatePlaylist(entries), time);
  }

  updatePlaylist(entries) {
    this.setState({ playlist: entries });
    this.setPlayhead();
  }

  triggerNoteIndicator() {
    this.noteIndicator.classList.remove('trigger');
    setTimeout(_ => this.noteIndicator.classList.add('trigger'), 1);
  }

  setPlayhead() {
    this.setState({ playheadShown: true });

    if (this.playheadAnim !== null) {
      this.playheadAnim.restart();
      return
    }

    this.playheadAnim = anime({
      targets:    this.playhead,
      duration:   this.state.sequenceSize.toMilliseconds(),
      translateX: this.timeline.clientWidth,
      easing:     'linear',
    });
  }

  render() {
    console.log('okay re-rendering')

    return <li className="platform">
      <span className={classNames('platform-icon', this.props.platform)} />
      <span className="note-indicator" ref={n => this.noteIndicator = n} />
      <div className="sequence-timeline" ref={n => this.timeline = n}>
        <span
          className={classNames('playhead', { shown: this.state.playheadShown })}
          ref={n => this.playhead = n} />
        <SeqeuenceCanvas
          playlist={this.state.playlist}
          sequenceSize={this.state.sequenceSize}
          width={734}
          height={48} />
      </div>
    </li>;
  }
}

const heading = <header>
  <div className="logo">
    <h1>Sentry</h1>
    <h1>Echo</h1>
  </div>
  <p>
    Listen the beautiful soundscape generated by software breaking around the
    world. Hear the sound of errors — Powered by sentry.io
  </p>
</header>;

const synthBank = [
  new Tone.PluckSynth().toMaster(),
  new Tone.MembraneSynth().toMaster(),
  new Tone.AMSynth().toMaster(),
]

class App extends Component {
  constructor() {
    super()

    this.state = {
      globalSequenceSize: new Tone.Time('4:0:0'),
      ordering:           lodash.cloneDeep(defaultGrouping),
      bpmDivider:         6,
      currentBpm:         new Number(0),
      eventsPerSecond:    new Number(0),
    };

    this.eventBuffer = lodash.fromPairs(platforms.map(p => [p, []]));
    this.eventsPerSequence = 0;

    this.starting = this.starting.bind(this);
    this.recomputeBpm = this.recomputeBpm.bind(this);
  }

  componentDidMount() {
    this.props.eventStream.onmessage = this.processEvents.bind(this);

    const start = this.state.globalSequenceSize;
    Tone.Transport.schedule(t => Tone.Draw.schedule(this.starting, t), start);

    // The BPM should be updated *just* before any other updates are scheduled
    const oneTickBack = start.clone().sub('1t')
    new Tone.Loop(this.recomputeBpm, this.state.globalSequenceSize).start(oneTickBack);
  }

  processEvents(message) {
    const [ latitude, longitude, ts, platform ] = JSON.parse(message.data);

    if (this.eventBuffer[platform] === undefined) {
      return;
    }

    this.eventsPerSequence++;
    this.eventBuffer[platform].push(ts);
  }

  starting() {
    this.setState({ playing: true  });
  }

  recomputeBpm(time) {
    const eventCount = this.eventsPerSequence;
    this.eventsPerSequence = 0;

    const eventsPerSecond = eventCount / this.state.globalSequenceSize;
    const currentBpm = eventsPerSecond / this.state.bpmDivider;

    Tone.Draw.schedule(_ => this.setState({ eventsPerSecond, currentBpm }), time);

    // Update the BPM of the transport at the precise time
    Tone.Transport.bpm.value = currentBpm;
  }

  render() {
    const sequencerList = this.state.ordering.map((items, i) => {
      const heading = <li key={i} className="instrument-heading">
        {instrumentGroups[i]}
      </li>;

      const sequencers = items.map((p, j) => <PlatformSequence key={p}
        synth={synthBank[i]}
        instrumentIndex={j}
        eventBuffer={this.eventBuffer}
        platform={p} />);

      return [ heading, sequencers ];
    })

    const readyClass = { ready: this.state.playing };

    const loader = <span className={classNames('loading-sequence', readyClass)}>
      Waiting {this.state.globalSequenceSize.toSeconds().toFixed(1) + ' '}
      seconds for first sequence of events...
    </span>;

    const bpmClasses = classNames('bpm-indicator', {
      ready: this.state.playing,
    });

    const bpmIndicator = <h1 className={classNames('bpm-indicator', readyClass)}>
      <AnimatedNumber
        value={this.state.currentBpm}
        formatValue={n => n.toFixed(2)}
        duration={600} />
      <small>BPM</small>
      <div>
        {this.state.eventsPerSecond.toFixed(1) + ' '}
        errors ∕ second ÷ {this.state.bpmDivider}
      </div>
    </h1>;

    return <div id="sentry_echo">
      {heading}
      <div className="main-app">
        {loader}
        {bpmIndicator}
        <ul className="sequencers">{sequencerList}</ul>
      </div>
    </div>;
  }
}

export default App;
