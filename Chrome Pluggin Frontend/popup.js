// popup.js

document.addEventListener("DOMContentLoaded", async () => {
  const outputDiv = document.getElementById("output");
  const API_KEY = 'AIzaSyAJilUCsG0bzVBzmgJQd5Ub8BHpY9wZsug';  // Replace with your actual YouTube Data API key
  
  const API_URL = 'http://127.0.0.1:5000';

  // Optional theme toggle listener (for UI polish, no impact on core logic)
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.body.dataset.theme = document.body.dataset.theme === 'light' ? '' : 'light';
    });
  }

  let topComments = []; // Global array to store top 25 predictions for filtering

  // Modal elements
  const modal = document.getElementById('image-modal');
  const modalImg = document.getElementById('modal-image');
  const modalClose = document.getElementById('modal-close');

  // Close modal when clicking the close button
  modalClose.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Close modal when clicking outside the image
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });

  // Get the current tab's URL
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const url = tabs[0].url;
    const youtubeRegex = /^https:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})/;
    const match = url.match(youtubeRegex);

    if (match && match[1]) {
      const videoId = match[1];
      outputDiv.innerHTML = `<div class="section-title">YouTube Video ID</div><p>${videoId}</p><p>Fetching comments...</p>`;

      const comments = await fetchComments(videoId);
      if (comments.length === 0) {
        outputDiv.innerHTML += "<p>No comments found for this video.</p>";
        return;
      }

      outputDiv.innerHTML += `<p>Fetched ${comments.length} comments. Performing sentiment analysis...</p>`;
      const predictions = await getSentimentPredictions(comments);

      if (predictions) {
        // Process the predictions to get sentiment counts and sentiment data
        const sentimentCounts = { "1": 0, "0": 0, "-1": 0 };
        const sentimentData = []; // For trend graph
        const totalSentimentScore = predictions.reduce((sum, item) => sum + parseInt(item.sentiment), 0);
        predictions.forEach((item, index) => {
          sentimentCounts[item.sentiment]++;
          sentimentData.push({
            timestamp: item.timestamp,
            sentiment: parseInt(item.sentiment)
          });
        });

        // Compute metrics
        const totalComments = comments.length;
        const uniqueCommenters = new Set(comments.map(comment => comment.authorId)).size;
        const totalWords = comments.reduce((sum, comment) => sum + comment.text.split(/\s+/).filter(word => word.length > 0).length, 0);
        const avgWordLength = (totalWords / totalComments).toFixed(2);
        const avgSentimentScore = (totalSentimentScore / totalComments).toFixed(2);

        // Normalize the average sentiment score to a scale of 0 to 10
        const normalizedSentimentScore = (((parseFloat(avgSentimentScore) + 1) / 2) * 10).toFixed(2);

        // Add the Comment Analysis Summary section
        outputDiv.innerHTML += `
          <div class="section">
            <div class="section-title">Comment Analysis Summary</div>
            <div class="metrics-container">
              <div class="metric">
                <div class="metric-title">Total Comments</div>
                <div class="metric-value">${totalComments}</div>
              </div>
              <div class="metric">
                <div class="metric-title">Unique Commenters</div>
                <div class="metric-value">${uniqueCommenters}</div>
              </div>
              <div class="metric">
                <div class="metric-title">Avg Comment Length</div>
                <div class="metric-value">${avgWordLength} words</div>
              </div>
              <div class="metric">
                <div class="metric-title">Avg Sentiment Score</div>
                <div class="metric-value">${normalizedSentimentScore}/10</div>
              </div>
            </div>
          </div>
        `;

        // Add the Sentiment Analysis Results section with a placeholder for the chart
        outputDiv.innerHTML += `
          <div class="section">
            <div class="section-title">Sentiment Analysis Results</div>
            <p>See the pie chart below for sentiment distribution.</p>
            <div id="chart-container" class="loading"></div>
          </div>`;

        // Fetch and display the pie chart inside the chart-container div
        await fetchAndDisplayChart(sentimentCounts);

        // Add the Sentiment Trend Graph section
        outputDiv.innerHTML += `
          <div class="section">
            <div class="section-title">Sentiment Trend Over Time</div>
            <div id="trend-graph-container" class="loading"></div>
          </div>`;

        // Fetch and display the sentiment trend graph
        await fetchAndDisplayTrendGraph(sentimentData);

        // Add the Word Cloud section
        outputDiv.innerHTML += `
          <div class="section">
            <div class="section-title">Comment Wordcloud</div>
            <div id="wordcloud-container" class="loading"></div>
          </div>`;

        // Fetch and display the word cloud inside the wordcloud-container div
        await fetchAndDisplayWordCloud(comments.map(comment => comment.text));

        // Store top 25 comments for filtering
        topComments = predictions.slice(0, 25);

        // Add the top comments section with filters
        outputDiv.innerHTML += `
          <div class="section" id="comments-section">
            <div class="section-title">Top 25 Comments with Sentiments</div>
            <div class="filter-container">
              <input type="text" id="keyword-search" class="filter-input" placeholder="Search keywords...">
              <select id="sentiment-filter" class="filter-select">
                <option value="all">All Sentiments</option>
                <option value="1">Positive (1)</option>
                <option value="0">Neutral (0)</option>
                <option value="-1">Negative (-1)</option>
              </select>
            </div>
            <ul id="comment-list" class="comment-list"></ul>
          </div>`;

        // Initial render of comments
        renderComments(topComments);

        // Add event listeners for filtering
        const keywordSearch = document.getElementById('keyword-search');
        const sentimentFilter = document.getElementById('sentiment-filter');

        keywordSearch.addEventListener('input', updateComments);
        sentimentFilter.addEventListener('change', updateComments);
      }
    } else {
      outputDiv.innerHTML = "<p>This is not a valid YouTube URL.</p>";
    }
  });

  async function fetchComments(videoId) {
    let comments = [];
    let pageToken = "";
    try {
      while (comments.length < 2000) {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&pageToken=${pageToken}&key=${API_KEY}`);
        const data = await response.json();
        if (data.items) {
          data.items.forEach(item => {
            const commentText = item.snippet.topLevelComment.snippet.textOriginal;
            const timestamp = item.snippet.topLevelComment.snippet.publishedAt;
            const authorId = item.snippet.topLevelComment.snippet.authorChannelId?.value || 'Unknown';
            comments.push({ text: commentText, timestamp: timestamp, authorId: authorId });
          });
        }
        pageToken = data.nextPageToken;
        if (!pageToken) break;
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
      outputDiv.innerHTML += "<p>Error fetching comments.</p>";
    }
    return comments;
  }

  async function getSentimentPredictions(comments) {
    try {
      const response = await fetch(`${API_URL}/predict_with_timestamps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments })
      });
      const result = await response.json();
      if (response.ok) {
        return result; // The result now includes sentiment and timestamp
      } else {
        throw new Error(result.error || 'Error fetching predictions');
      }
    } catch (error) {
      console.error("Error fetching predictions:", error);
      outputDiv.innerHTML += "<p>Error fetching sentiment predictions.</p>";
      return null;
    }
  }

  async function fetchAndDisplayChart(sentimentCounts) {
    const chartContainer = document.getElementById('chart-container');
    try {
      const response = await fetch(`${API_URL}/generate_chart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentiment_counts: sentimentCounts })
      });
      if (!response.ok) {
        throw new Error('Failed to fetch chart image');
      }
      const blob = await response.blob();
      const imgURL = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.src = imgURL;
      img.style.width = '100%';
      img.style.marginTop = '20px';
      img.loading = 'lazy'; // For performance
      img.style.cursor = 'pointer'; // Make it look clickable
      img.addEventListener('click', () => {
        modal.style.display = 'block';
        modalImg.src = img.src; // Set modal image to the clicked one
      });
      // Append the image to the chart-container div
      chartContainer.appendChild(img);
      chartContainer.classList.remove('loading'); // Remove loading indicator
    } catch (error) {
      console.error("Error fetching chart image:", error);
      outputDiv.innerHTML += "<p>Error fetching chart image.</p>";
      chartContainer.classList.remove('loading');
    }
  }

  async function fetchAndDisplayWordCloud(comments) {
    const wordcloudContainer = document.getElementById('wordcloud-container');
    try {
      const response = await fetch(`${API_URL}/generate_wordcloud`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments })
      });
      if (!response.ok) {
        throw new Error('Failed to fetch word cloud image');
      }
      const blob = await response.blob();
      const imgURL = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.src = imgURL;
      img.style.width = '100%';
      img.style.marginTop = '20px';
      img.loading = 'lazy'; // For performance
      img.style.cursor = 'pointer'; // Make it look clickable
      img.addEventListener('click', () => {
        modal.style.display = 'block';
        modalImg.src = img.src; // Set modal image to the clicked one
      });
      // Append the image to the wordcloud-container div
      wordcloudContainer.appendChild(img);
      wordcloudContainer.classList.remove('loading'); // Remove loading indicator
    } catch (error) {
      console.error("Error fetching word cloud image:", error);
      outputDiv.innerHTML += "<p>Error fetching word cloud image.</p>";
      wordcloudContainer.classList.remove('loading');
    }
  }

  async function fetchAndDisplayTrendGraph(sentimentData) {
    const trendGraphContainer = document.getElementById('trend-graph-container');
    try {
      const response = await fetch(`${API_URL}/generate_trend_graph`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentiment_data: sentimentData })
      });
      if (!response.ok) {
        throw new Error('Failed to fetch trend graph image');
      }
      const blob = await response.blob();
      const imgURL = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.src = imgURL;
      img.style.width = '100%';
      img.style.marginTop = '20px';
      img.loading = 'lazy'; // For performance
      img.style.cursor = 'pointer'; // Make it look clickable
      img.addEventListener('click', () => {
        modal.style.display = 'block';
        modalImg.src = img.src; // Set modal image to the clicked one
      });
      // Append the image to the trend-graph-container div
      trendGraphContainer.appendChild(img);
      trendGraphContainer.classList.remove('loading'); // Remove loading indicator
    } catch (error) {
      console.error("Error fetching trend graph image:", error);
      outputDiv.innerHTML += "<p>Error fetching trend graph image.</p>";
      trendGraphContainer.classList.remove('loading');
    }
  }

  // Function to render filtered comments
  function renderComments(comments) {
    const commentList = document.getElementById('comment-list');
    commentList.innerHTML = comments.map((item, index) => `
      <li class="comment-item">
        <span>${index + 1}. ${item.comment}</span><br>
        <span class="comment-sentiment" data-sentiment="${item.sentiment}">Sentiment: ${item.sentiment}</span>
      </li>
    `).join('');
  }

  // Function to apply filters and update the list
  function updateComments() {
    const keyword = document.getElementById('keyword-search').value.toLowerCase();
    const sentiment = document.getElementById('sentiment-filter').value;

    let filtered = topComments;

    // Apply sentiment filter
    if (sentiment !== 'all') {
      filtered = filtered.filter(item => item.sentiment === sentiment);
    }

    // Apply keyword search
    if (keyword) {
      filtered = filtered.filter(item => item.comment.toLowerCase().includes(keyword));
    }

    // Re-render the list
    renderComments(filtered);
  }
});
