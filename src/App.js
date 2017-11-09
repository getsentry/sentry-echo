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

const defaultGrouping = [
  [ 'javascript', 'node', 'python', 'ruby' ],
  [ 'csharp', 'elixir', 'go', 'php' ],
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


  render() {
    return <svg width={this.props.width} height={this.props.height}>
      <g className="bar-lines">
        {this.makeBarGrid()}
      </g>



    </svg>;
  }
}


class PlatformSequence extends Component {
  constructor() {
    super();

    this.state = {
      sequenceSize:  new Tone.Time('4:0:0'),
      playheadShown: false,
      playing:       false,
    };

    this.timeline = null;
    this.playhead = null

    this.movePlayhead = this.movePlayhead.bind(this);
    this.processEvents = this.processEvents.bind(this);
  }

  componentDidMount() {
    const start = this.state.sequenceSize

    // Schedule repeating event sampling for this platform
    new Tone.Loop(this.processEvents, this.state.sequenceSize).start(start)
  }

  processEvents(time) {
    // Update the playhead animation
    Tone.Draw.schedule(this.movePlayhead, time);

    // XXX: This isn't great that we're directly mutating this here, probably
    // would be nicer to keep doing things in a react-esq way in which case
    // this *should* be immutable, but whatever, it's a hackweek project.
    let entries = this.props.eventBuffer[this.props.platform].sort()
    this.props.eventBuffer[this.props.platform] = [];

    // Normalize entry timestamps to seconds starting relative to the start of
    // the upcoming sequence.
    const earliestTime = entries[0];
    entries = entries.map(e => new Tone.Time((e - earliestTime) / 1000));

    entries = entries.map(e => e.quantize('16n').toSeconds())

    //console.log(entries)
    //console.log('setting up fisrt event list')
  }

  movePlayhead() {
    this.setState({ playheadShown: true, playing: true });

    this.playhead.style.transform = 'translateX(0)';

    const width = this.timeline.clientWidth;
    anime({
      targets:    this.playhead,
      duration:   this.state.sequenceSize.toMilliseconds(),
      translateX: width,
      easing:     'linear',
    });
  }

  render() {
    return <li className="platform">
      <span className={classNames('platform-icon', this.props.platform)} />
      <span className="note-indicator" />
      <div className="sequence-timeline" ref={n => this.timeline = n}>
        <span
          className={classNames('playhead', { shown: this.state.playheadShown })}
          ref={n => this.playhead = n} />
        <SeqeuenceCanvas
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

class App extends Component {
  constructor() {
    super()

    this.state = {
      globalSequenceSize: new Tone.Time('4:0:0'),
      ordering:           lodash.cloneDeep(defaultGrouping),
      bpmDivider:         5,
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

    new Tone.Loop(this.recomputeBpm, this.state.globalSequenceSize).start(start);
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

    this.setState({ eventsPerSecond, currentBpm });

    // Update the BPM of the transport at the precise time
    Tone.Transport.bpm.setValueAtTime(currentBpm, time);
  }

  render() {
    const sequencerList = this.state.ordering.map((items, i) => {
      const heading = <li key={i} className="instrument-heading">
        {instrumentGroups[i]}
      </li>;

      const sequencers = items.map(p => <PlatformSequence key={p}
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
