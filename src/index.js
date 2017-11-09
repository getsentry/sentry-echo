import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

import './index.scss';

const stream = new EventSource("https://live.sentry.io:7000")

ReactDOM.render(<App eventStream={stream} />, document.getElementById('root'));
