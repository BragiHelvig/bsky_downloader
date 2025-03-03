const { BskyAgent } = require('@atproto/api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const readline = require('readline');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const ProgressBar = require('progress');

// Create download directory if it doesn't exist
const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir);
}

// Initialize Bluesky agent
const agent = new BskyAgent({
  service: 'https://bsky.social',
});

// Setup readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Ask a question and get the answer
function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

// Main function
async function main() {
  try {
    console.log('\n==============================================');
    console.log('🌟 BLUESKY VIDEO DOWNLOADER 🌟');
    console.log('==============================================\n');
    
    // Login to Bluesky
    await login();
    
    // Get liked posts
    const likedPosts = await getLikedPosts();
    
    // Filter posts with videos
    const videoPosts = filterVideoPosts(likedPosts);
    
    if (videoPosts.length === 0) {
      console.log('\n❌ No videos found in your liked posts.');
      return;
    }
    
    // Ask user if they want to download videos
    const answer = await question(`\n📥 Found ${videoPosts.length} videos. Do you want to download them now? (y/n): `);
    
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      // Download videos
      await downloadVideosInteractive(videoPosts);
    } else {
      console.log('\n✅ Download canceled. Goodbye!');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    rl.close();
  }
}

// Login function
async function login() {
  console.log('👤 Please log in to your Bluesky account:');
  const identifier = await question('   Email or username: ');
  const password = await question('   Password: ');
  
  try {
    await agent.login({
      identifier,
      password,
    });
    console.log('\n✅ Logged in successfully!');
  } catch (error) {
    throw new Error(`❌ Login failed: ${error.message}`);
  }
}

// Get liked posts
async function getLikedPosts() {
  console.log('\n🔍 Fetching your liked posts...');
  
  const likedPosts = [];
  let cursor;
  let page = 1;
  
  // Create a progress bar for fetching posts
  const fetchBar = new ProgressBar('   [:bar] :current/:total pages fetched (:percent)', {
    complete: '=',
    incomplete: ' ',
    width: 30,
    total: 5 // We'll update this as we go
  });
  
  // Fetch multiple pages of likes
  do {
    // Using the correct API method for getting likes
    const response = await agent.getActorLikes({
      actor: agent.session.did,
      cursor,
      limit: 100,
    });
    
    likedPosts.push(...response.data.feed);
    cursor = response.data.cursor;
    
    // Update progress bar
    fetchBar.tick();
    
    // If we're at page 5 and there's still more, extend the bar
    if (page === fetchBar.total && cursor) {
      fetchBar.total += 5;
    }
    
    page++;
    
    // Break if we have no cursor or reached a reasonable limit
    if (!cursor || likedPosts.length >= 500) break;
    
  } while (cursor);
  
  console.log(`\n✅ Total liked posts fetched: ${likedPosts.length}`);
  return likedPosts;
}

// Filter posts with videos
function filterVideoPosts(likedPosts) {
  console.log('\n🎬 Scanning for videos in your liked posts...');
  
  // Create a progress bar for scanning posts
  const scanBar = new ProgressBar('   [:bar] :current/:total posts scanned (:percent)', {
    complete: '=',
    incomplete: ' ',
    width: 30,
    total: likedPosts.length
  });
  
  const videoPosts = [];
  
  for (const item of likedPosts) {
    const post = item.post;
    
    if (post && post.embed) {
      // Get the embed type, removing the #view suffix if present
      const embedType = post.embed.$type.split('#')[0];
      
      // Direct check for video embeds
      if (embedType === 'app.bsky.embed.video') {
        videoPosts.push(item);
      }
      // Check for external embeds with videos
      else if (embedType === 'app.bsky.embed.external') {
        if (post.embed.external && 
            (post.embed.external.isVideo || 
             (post.embed.external.url && 
              (post.embed.external.url.includes('youtube.com') || 
               post.embed.external.url.includes('youtu.be') || 
               post.embed.external.url.includes('vimeo.com') ||
               post.embed.external.url.endsWith('.mp4'))))) {
          videoPosts.push(item);
        }
      }
      // Check for videos in record with media
      else if (embedType === 'app.bsky.embed.recordWithMedia') {
        if (post.embed.media) {
          const mediaType = post.embed.media.$type.split('#')[0];
          
          if (mediaType === 'app.bsky.embed.video') {
            videoPosts.push(item);
          }
          else if (mediaType === 'app.bsky.embed.external' && 
              post.embed.media.external && 
              (post.embed.media.external.isVideo || 
               (post.embed.media.external.url && 
                (post.embed.media.external.url.includes('youtube.com') || 
                 post.embed.media.external.url.includes('youtu.be') || 
                 post.embed.media.external.url.includes('vimeo.com') ||
                 post.embed.media.external.url.endsWith('.mp4'))))) {
            videoPosts.push(item);
          }
        }
      }
    }
    
    // Update progress bar
    scanBar.tick();
  }
  
  console.log(`✅ Found ${videoPosts.length} posts with videos.`);
  return videoPosts;
}

// Check if ffmpeg is installed
async function checkFfmpeg() {
  try {
    await execPromise('ffmpeg -version');
    return true;
  } catch (error) {
    return false;
  }
}

// Check if yt-dlp is installed
async function checkYtDlp() {
  try {
    await execPromise('yt-dlp --version');
    return true;
  } catch (error) {
    return false;
  }
}

// Download videos with interactive progress
async function downloadVideosInteractive(videoPosts) {
  console.log('\n📥 Starting video downloads...');
  
  // Check for ffmpeg and yt-dlp
  const hasFfmpeg = await checkFfmpeg();
  const hasYtDlp = await checkYtDlp();
  
  if (!hasFfmpeg && !hasYtDlp) {
    console.log('\n⚠️  Warning: Neither ffmpeg nor yt-dlp is installed.');
    console.log('   Some videos may not download correctly.');
    console.log('   For best results, install ffmpeg and yt-dlp.');
    
    const proceed = await question('\n   Do you want to continue anyway? (y/n): ');
    if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
      console.log('\n✅ Download canceled. Goodbye!');
      return;
    }
  }
  
  // Get list of existing files in download directory
  const existingFiles = fs.readdirSync(downloadDir);
  
  // Create a progress bar for overall download progress
  const overallBar = new ProgressBar('\n   Overall Progress: [:bar] :current/:total (:percent) | ETA: :etas', {
    complete: '█',
    incomplete: '░',
    width: 30,
    total: videoPosts.length
  });
  
  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  for (let i = 0; i < videoPosts.length; i++) {
    const item = videoPosts[i];
    const post = item.post;
    const postId = post.uri.split('/').pop();
    
    console.log(`\n📹 Processing video ${i+1}/${videoPosts.length}: ${postId}`);
    
    // Check if this video was already downloaded
    const alreadyDownloaded = existingFiles.some(file => 
      file.startsWith(postId + '_') && file.endsWith('.mp4')
    );
    
    if (alreadyDownloaded) {
      console.log(`   ⏩ Skipping - already downloaded`);
      skippedCount++;
      overallBar.tick();
      continue;
    }
    
    try {
      let videoUrl;
      
      // Get the embed type, removing the #view suffix if present
      const embedType = post.embed.$type.split('#')[0];
      
      // Extract video URL based on embed type
      if (embedType === 'app.bsky.embed.video') {
        // Check for playlist URL (HLS stream)
        if (post.embed.playlist) {
          videoUrl = post.embed.playlist;
        } else if (post.embed.video && post.embed.video.url) {
          videoUrl = post.embed.video.url;
        }
      } else if (embedType === 'app.bsky.embed.external') {
        if (post.embed.external && post.embed.external.url) {
          videoUrl = post.embed.external.url;
          
          // Handle YouTube and other video platforms
          if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
            console.log(`   ℹ️  YouTube video found: ${videoUrl}`);
            if (hasYtDlp) {
              console.log('   🔄 Downloading with yt-dlp...');
              const timestamp = new Date().getTime();
              const outputPath = path.join(downloadDir, `${postId}_${timestamp}.mp4`);
              
              try {
                // Create a progress bar for this download
                const downloadBar = new ProgressBar('   Progress: [:bar] :percent', {
                  complete: '=',
                  incomplete: ' ',
                  width: 30,
                  total: 100
                });
                
                // Start a progress updater
                let progress = 0;
                const progressInterval = setInterval(() => {
                  progress += Math.random() * 5;
                  if (progress > 95) progress = 95;
                  downloadBar.update(progress / 100);
                }, 500);
                
                await execPromise(`yt-dlp -o "${outputPath}" "${videoUrl}"`);
                
                // Complete the progress bar
                clearInterval(progressInterval);
                downloadBar.update(1);
                
                console.log('   ✅ Downloaded successfully!');
                downloadedCount++;
                overallBar.tick();
                continue;
              } catch (error) {
                console.log(`   ❌ Failed to download with yt-dlp: ${error.message}`);
                failedCount++;
                overallBar.tick();
                continue;
              }
            } else {
              console.log('   ⚠️  yt-dlp not found. Install it to download YouTube videos.');
              failedCount++;
              overallBar.tick();
              continue;
            }
          }
        }
      } else if (embedType === 'app.bsky.embed.recordWithMedia') {
        const mediaType = post.embed.media.$type.split('#')[0];
        
        if (mediaType === 'app.bsky.embed.video') {
          // Check for playlist URL (HLS stream)
          if (post.embed.media.playlist) {
            videoUrl = post.embed.media.playlist;
          } else if (post.embed.media.video && post.embed.media.video.url) {
            videoUrl = post.embed.media.video.url;
          }
        } else if (mediaType === 'app.bsky.embed.external') {
          if (post.embed.media.external && post.embed.media.external.url) {
            videoUrl = post.embed.media.external.url;
            
            // Handle YouTube and other video platforms
            if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
              console.log(`   ℹ️  YouTube video found: ${videoUrl}`);
              if (hasYtDlp) {
                console.log('   🔄 Downloading with yt-dlp...');
                const timestamp = new Date().getTime();
                const outputPath = path.join(downloadDir, `${postId}_${timestamp}.mp4`);
                
                try {
                  // Create a progress bar for this download
                  const downloadBar = new ProgressBar('   Progress: [:bar] :percent', {
                    complete: '=',
                    incomplete: ' ',
                    width: 30,
                    total: 100
                  });
                  
                  // Start a progress updater
                  let progress = 0;
                  const progressInterval = setInterval(() => {
                    progress += Math.random() * 5;
                    if (progress > 95) progress = 95;
                    downloadBar.update(progress / 100);
                  }, 500);
                  
                  await execPromise(`yt-dlp -o "${outputPath}" "${videoUrl}"`);
                  
                  // Complete the progress bar
                  clearInterval(progressInterval);
                  downloadBar.update(1);
                  
                  console.log('   ✅ Downloaded successfully!');
                  downloadedCount++;
                  overallBar.tick();
                  continue;
                } catch (error) {
                  console.log(`   ❌ Failed to download with yt-dlp: ${error.message}`);
                  failedCount++;
                  overallBar.tick();
                  continue;
                }
              } else {
                console.log('   ⚠️  yt-dlp not found. Install it to download YouTube videos.');
                failedCount++;
                overallBar.tick();
                continue;
              }
            }
          }
        }
      }
      
      if (!videoUrl) {
        console.log(`   ❌ No video URL found, skipping...`);
        failedCount++;
        overallBar.tick();
        continue;
      }
      
      // Create a filename based on post ID and timestamp
      const timestamp = new Date().getTime();
      const outputPath = path.join(downloadDir, `${postId}_${timestamp}.mp4`);
      
      // Check if it's an HLS stream
      if (videoUrl.includes('.m3u8') || videoUrl.includes('playlist')) {
        console.log(`   ℹ️  HLS stream detected`);
        
        if (hasFfmpeg) {
          console.log('   🔄 Downloading with ffmpeg...');
          
          try {
            // Create a progress bar for this download
            const downloadBar = new ProgressBar('   Progress: [:bar] :percent', {
              complete: '=',
              incomplete: ' ',
              width: 30,
              total: 100
            });
            
            // Start a progress updater
            let progress = 0;
            const progressInterval = setInterval(() => {
              progress += Math.random() * 3;
              if (progress > 95) progress = 95;
              downloadBar.update(progress / 100);
            }, 500);
            
            await execPromise(`ffmpeg -hide_banner -loglevel error -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 10 -timeout 10000000 -rw_timeout 10000000 -user_agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -http_persistent 0 -i "${videoUrl}" -c copy "${outputPath}"`);
            
            // Complete the progress bar
            clearInterval(progressInterval);
            downloadBar.update(1);
            
            console.log('   ✅ Downloaded successfully!');
            downloadedCount++;
          } catch (error) {
            console.log(`   ❌ Failed to download with ffmpeg: ${error.message}`);
            
            // Try with yt-dlp as fallback
            if (hasYtDlp) {
              console.log('   🔄 Trying with yt-dlp as fallback...');
              
              // Create a progress bar for this download
              const downloadBar = new ProgressBar('   Progress: [:bar] :percent', {
                complete: '=',
                incomplete: ' ',
                width: 30,
                total: 100
              });
              
              // Start a progress updater
              let progress = 0;
              const progressInterval = setInterval(() => {
                progress += Math.random() * 5;
                if (progress > 95) progress = 95;
                downloadBar.update(progress / 100);
              }, 500);
              
              try {
                await execPromise(`yt-dlp -o "${outputPath}" "${videoUrl}"`);
                
                // Complete the progress bar
                clearInterval(progressInterval);
                downloadBar.update(1);
                
                console.log('   ✅ Downloaded successfully with yt-dlp!');
                downloadedCount++;
              } catch (ytError) {
                // Complete the progress bar
                clearInterval(progressInterval);
                downloadBar.update(1);
                
                console.log(`   ❌ Failed to download with yt-dlp: ${ytError.message}`);
                failedCount++;
              }
            } else {
              failedCount++;
            }
          }
        } else if (hasYtDlp) {
          console.log('   🔄 Downloading with yt-dlp...');
          
          // Create a progress bar for this download
          const downloadBar = new ProgressBar('   Progress: [:bar] :percent', {
            complete: '=',
            incomplete: ' ',
            width: 30,
            total: 100
          });
          
          // Start a progress updater
          let progress = 0;
          const progressInterval = setInterval(() => {
            progress += Math.random() * 5;
            if (progress > 95) progress = 95;
            downloadBar.update(progress / 100);
          }, 500);
          
          try {
            await execPromise(`yt-dlp -o "${outputPath}" "${videoUrl}"`);
            
            // Complete the progress bar
            clearInterval(progressInterval);
            downloadBar.update(1);
            
            console.log('   ✅ Downloaded successfully!');
            downloadedCount++;
          } catch (error) {
            // Complete the progress bar
            clearInterval(progressInterval);
            downloadBar.update(1);
            
            console.log(`   ❌ Failed to download with yt-dlp: ${error.message}`);
            failedCount++;
          }
        } else {
          console.log('   ❌ Neither ffmpeg nor yt-dlp is installed. Cannot download HLS stream.');
          failedCount++;
        }
        
        overallBar.tick();
        continue;
      }
      
      // For direct video URLs (non-HLS)
      console.log(`   🔄 Downloading direct video...`);
      
      try {
        // Get the file size first to create an accurate progress bar
        const headResponse = await axios({
          method: 'HEAD',
          url: videoUrl
        });
        
        const totalSize = parseInt(headResponse.headers['content-length'] || 0);
        
        // Create a progress bar for this download
        const downloadBar = new ProgressBar('   Progress: [:bar] :percent | :current/:total bytes', {
          complete: '=',
          incomplete: ' ',
          width: 30,
          total: totalSize || 100
        });
        
        const response = await axios({
          method: 'GET',
          url: videoUrl,
          responseType: 'stream',
          onDownloadProgress: (progressEvent) => {
            if (totalSize) {
              downloadBar.update(progressEvent.loaded / totalSize);
            }
          }
        });
        
        let downloadedBytes = 0;
        
        response.data.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (totalSize) {
            downloadBar.update(downloadedBytes / totalSize);
          } else {
            // If we couldn't get the total size, just increment
            downloadBar.tick();
          }
        });
        
        const writer = fs.createWriteStream(outputPath);
        response.data.pipe(writer);
        
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
        
        // Make sure the progress bar is complete
        downloadBar.update(1);
        
        console.log('   ✅ Downloaded successfully!');
        downloadedCount++;
      } catch (error) {
        console.log(`   ❌ Failed to download: ${error.message}`);
        failedCount++;
      }
      
      overallBar.tick();
    } catch (error) {
      console.error(`   ❌ Error processing post ${postId}: ${error.message}`);
      failedCount++;
      overallBar.tick();
    }
  }
  
  // Show summary
  console.log('\n==============================================');
  console.log('📊 DOWNLOAD SUMMARY');
  console.log('==============================================');
  console.log(`✅ Successfully downloaded: ${downloadedCount}`);
  console.log(`⏩ Skipped (already downloaded): ${skippedCount}`);
  console.log(`❌ Failed to download: ${failedCount}`);
  console.log(`📁 Videos saved to: ${downloadDir}`);
  console.log('==============================================\n');
  
  if (failedCount > 0) {
    console.log('⚠️  Some videos failed to download. You might want to:');
    console.log('   1. Make sure ffmpeg and yt-dlp are installed');
    console.log('   2. Run the program again to retry failed downloads');
    console.log('   3. Check your internet connection\n');
  }
}

// Start the app
main(); 