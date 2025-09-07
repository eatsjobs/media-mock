import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { devices } from '@eatsjobs/media-mock';

interface MockState {
  isActive: boolean;
  device: string;
  mediaUrl: string;
  debugMode: boolean;
  autoDetected: boolean;
  uploadedFile: File | null;
  uploadedFileName: string;
}

// User agent detection for smart device selection
function detectDeviceFromUserAgent(userAgent: string): keyof typeof devices {
  const ua = userAgent.toLowerCase();
  
  // iOS devices → iPhone 12
  if (ua.includes('iphone') || ua.includes('ipad')) {
    return 'iPhone 12';
  }
  
  // Android mobile → Samsung Galaxy M53
  if (ua.includes('android') && ua.includes('mobile')) {
    return 'Samsung Galaxy M53';
  }
  
  // Desktop (default) → Mac Desktop
  return 'Mac Desktop';
}


function Popup() {
  const [state, setState] = useState<MockState>({
    isActive: false,
    device: Object.keys(devices)[0], // Will be updated by auto-detection
    mediaUrl: '',
    debugMode: false,
    autoDetected: false,
    uploadedFile: null,
    uploadedFileName: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    initializePopup();
  }, []);

  const initializePopup = async () => {
    try {
      // Get current tab and detect device from user agent
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tab.id) {
        // Execute script to get user agent from the tab
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => navigator.userAgent
        });
        
        if (results && results[0] && results[0].result) {
          const userAgent = results[0].result;
          const detectedDevice = detectDeviceFromUserAgent(userAgent);
          
          setState(prev => ({
            ...prev,
            device: detectedDevice,
            autoDetected: true
          }));
        }
      }
    } catch (error) {
      console.error('Failed to detect device from user agent:', error);
      // Fall back to first device if detection fails
    }
    
    // Check mock status regardless
    checkStatus();
  };

  const checkStatus = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id!, { action: 'GET_STATUS' });
      
      if (response?.success) {
        setState(prev => ({ ...prev, isActive: response.isActive }));
      }
    } catch (error) {
      console.error('Failed to check status:', error);
    }
  };

  const sendMessageToActiveTab = async (message: any) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return chrome.tabs.sendMessage(tab.id!, message);
  };

  const handleStartMock = async () => {
    if (!state.device) {
      showMessage('Please select a device', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await sendMessageToActiveTab({
        action: 'START_MOCK',
        config: {
          device: state.device,
          mediaUrl: state.mediaUrl,
          debugMode: state.debugMode
        }
      });

      if (response?.success) {
        setState(prev => ({ ...prev, isActive: true }));
        showMessage('MediaMock started successfully', 'success');
      } else {
        throw new Error(response?.error || 'Failed to start mock');
      }
    } catch (error) {
      showMessage(`Failed to start: ${(error as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStopMock = async () => {
    setLoading(true);
    try {
      const response = await sendMessageToActiveTab({ action: 'STOP_MOCK' });
      
      if (response?.success) {
        setState(prev => ({ ...prev, isActive: false }));
        showMessage('MediaMock stopped', 'success');
      } else {
        throw new Error(response?.error || 'Failed to stop mock');
      }
    } catch (error) {
      showMessage(`Failed to stop: ${(error as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTestCamera = async () => {
    setLoading(true);
    try {
      const response = await sendMessageToActiveTab({ action: 'TEST_CAMERA' });
      
      if (response?.success) {
        showMessage('Camera test completed - check console for details', 'success');
      } else {
        throw new Error(response?.error || 'Camera test failed');
      }
    } catch (error) {
      showMessage(`Camera test failed: ${(error as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text: string, _type: 'success' | 'error') => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };


  const handleDeviceChange = (deviceName: string) => {
    setState(prev => ({
      ...prev,
      device: deviceName,
      autoDetected: false // Clear auto-detected flag when user manually changes
    }));
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const validVideoTypes = ['video/mp4', 'video/webm', 'video/mov', 'video/avi', 'video/mkv'];
    const validTypes = [...validImageTypes, ...validVideoTypes];

    if (!validTypes.includes(file.type)) {
      showMessage('Please select a valid image or video file', 'error');
      return;
    }

    // Check file size (limit to 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      showMessage('File size must be less than 50MB', 'error');
      return;
    }

    // Read file and convert to data URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setState(prev => ({
        ...prev,
        mediaUrl: dataUrl,
        uploadedFile: file,
        uploadedFileName: file.name
      }));
      showMessage(`Uploaded ${file.name} successfully`, 'success');
    };
    
    reader.onerror = () => {
      showMessage('Failed to read file', 'error');
    };

    reader.readAsDataURL(file);
  };

  const clearUploadedFile = () => {
    setState(prev => ({
      ...prev,
      mediaUrl: '',
      uploadedFile: null,
      uploadedFileName: ''
    }));
    
    // Clear the file input
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  return (
    <div className="popup-container">
      <div className="header">
        <div className="logo">M</div>
        <div className="title">MediaMock</div>
      </div>

      {message && (
        <div className={`message ${message.includes('success') ? 'success' : 'error'}`}>
          {message}
        </div>
      )}

      <div className={`status ${state.isActive ? 'active' : 'inactive'}`}>
        Status: {state.isActive ? 'Active' : 'Inactive'}
      </div>

      <div className="section">
        <div className="section-title">
          Device Configuration
          {state.autoDetected && <span className="auto-badge">Auto</span>}
        </div>
        <select 
          className="select"
          value={state.device}
          onChange={(e) => handleDeviceChange(e.target.value)}
          disabled={state.isActive}
        >
          {Object.entries(devices).map(([deviceName, _deviceConfig]) => {
            // Classify device based on name patterns
            const isMobile = deviceName.includes('iPhone') || deviceName.includes('Samsung');
            return (
              <option key={deviceName} value={deviceName}>
                {deviceName} ({isMobile ? 'Mobile' : 'Desktop'})
              </option>
            );
          })}
        </select>
        
        {state.device && devices[state.device as keyof typeof devices] && (
          <div className="device-info">
            <div className="device-detail">
              <strong>Resolutions:</strong> {devices[state.device as keyof typeof devices].videoResolutions.map(res => `${res.width}x${res.height}`).join(', ')}
            </div>
            <div className="device-detail">
              <strong>Cameras:</strong> {devices[state.device as keyof typeof devices].mediaDeviceInfo.filter(d => d.kind === 'videoinput').length}
            </div>
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">Media Source</div>
        
        {/* File Upload Section */}
        <div className="upload-section">
          <input
            id="file-upload"
            type="file"
            accept="image/*,video/*"
            onChange={handleFileUpload}
            disabled={state.isActive}
            className="file-input"
          />
          <label htmlFor="file-upload" className={`button button-upload ${state.isActive ? 'disabled' : ''}`}>
            📁 Upload Local File
          </label>
        </div>

        {/* Show uploaded file info */}
        {state.uploadedFile && (
          <div className="uploaded-file-info">
            <div className="file-details">
              <span className="file-icon">
                {state.uploadedFile.type.startsWith('video/') ? '🎥' : '🖼️'}
              </span>
              <span className="file-name">{state.uploadedFileName}</span>
              <span className="file-size">
                ({(state.uploadedFile.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            </div>
            <button
              className="button button-small button-danger"
              onClick={clearUploadedFile}
              disabled={state.isActive}
            >
              ✕
            </button>
          </div>
        )}

        {/* URL Input */}
        <input 
          type="text"
          className="input"
          placeholder="Or enter image/video URL"
          value={state.uploadedFile ? '' : state.mediaUrl}
          onChange={(e) => setState(prev => ({ ...prev, mediaUrl: e.target.value }))}
          disabled={state.isActive || !!state.uploadedFile}
        />
      </div>

      <div className="section">
        <label className="checkbox-label">
          <input 
            type="checkbox"
            checked={state.debugMode}
            onChange={(e) => setState(prev => ({ ...prev, debugMode: e.target.checked }))}
            disabled={state.isActive}
          />
          Enable debug mode
        </label>
      </div>

      <div className="section buttons">
        <button
          className="button button-primary"
          onClick={handleStartMock}
          disabled={loading || state.isActive}
        >
          {loading ? 'Starting...' : 'Start Mock'}
        </button>
        
        <button
          className="button button-danger"
          onClick={handleStopMock}
          disabled={loading || !state.isActive}
        >
          {loading ? 'Stopping...' : 'Stop Mock'}
        </button>
      </div>

      <div className="section">
        <button
          className="button button-secondary full-width"
          onClick={handleTestCamera}
          disabled={loading}
        >
          {loading ? 'Testing...' : 'Test Camera Access'}
        </button>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}