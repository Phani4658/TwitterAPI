//Importing modules
const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const path = require("path");

//Initializing the server
const app = express();
app.use(express.json());

//Starting Database and server
let db = null;
const dbPath = path.join(__dirname, "./twitterClone.db");
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server live on http://localhost:3000/")
    );
  } catch (e) {
    console.log(`DB Error:${e.message}`);
  }
};

initializeDBAndServer();

//Register user API
app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const user = await db.get(getUserQuery);
  if (user === undefined) {
    if (password.length < 6) {
      res.status(400);
      res.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const registerUserQuery = `
          INSERT INTO user(username,password,name,gender)
          VALUES(
              '${username}',
              '${hashedPassword}',
              '${name}',
              '${gender}'
          );
          `;
      await db.run(registerUserQuery);
      res.send("User created successfully");
    }
  } else {
    res.status(400);
    res.send("User already exists");
  }
});

//Login user API

app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const user = await db.get(getUserQuery);
  if (user === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    isPasswordMatched = await bcrypt.compare(password, user.password);
    if (isPasswordMatched) {
      let payload = {
        username: username,
      };
      let jwtToken = jwt.sign(payload, "SECRET");
      res.send({
        jwtToken: jwtToken,
      });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  }
});

//Authentication middleware function
const authenticate = (req, res, next) => {
  let jwtToken;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET", async (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        const getUserQuery = `SELECT * FROM user WHERE username = '${payload.username}';`;
        const user = await db.get(getUserQuery);
        req.userId = user.user_id;
        next();
      }
    });
  }
};

//Get Feed API - Mistake near query
app.get("/user/tweets/feed/", authenticate, async (req, res) => {
  const userId = req.userId;
  const getFollowingList = `
  SELECT user_id FROM user JOIN follower ON user.user_id = follower.following_user_id WHERE follower.follower_user_id = ${userId};
  `;
  let followingList = await db.all(getFollowingList);
  console.log(followingList);
  const getLatestTweets = `
    SELECT username,tweet,date_time as dateTime
    FROM (follower JOIN tweet ON follower.following_user_id = tweet.user_id) AS following_tweet JOIN 
    user ON user.user_id = following_tweet.user_id
    WHERE following_user_id IN ( SELECT following_user_id FROM follower WHERE follower_user_id = ${userId})
    ORDER BY dateTime DESC
    LIMIT 4
    `;
  const latestTweets = await db.all(getLatestTweets);
  res.send(latestTweets);
});

//Following list API
let followingList, followersList;
app.get("/user/following", authenticate, async (req, res) => {
  const userId = req.userId;
  const getFollowingList = `
  SELECT name FROM user JOIN follower ON user.user_id = follower.following_user_id WHERE follower.follower_user_id = ${userId};
  `;
  followingList = await db.all(getFollowingList);
  res.send(followingList);
});

//Followers list API
app.get("/user/followers", authenticate, async (req, res) => {
  const userId = req.userId;
  const getFollowersList = `
  SELECT name
  FROM user JOIN follower ON user.user_id = follower.follower_user_id
  WHERE follower.following_user_id = ${userId};
  `;
  followersList = await db.all(getFollowersList);
  res.send(followersList);
});

//get User Tweets
app.get("/user/tweets/", authenticate, async (req, res) => {
  const userId = req.userId;
  const getTweets = `
    SELECT tweet,SUM(like_id) AS likes,SUM(reply_id) as replies,tweet.date_time AS dateTime 
    FROM (tweet JOIN reply ON tweet.tweet_id = reply.reply_id) AS T JOIN like ON T.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${userId};
    GROUP BY tweet
    `;
  const tweets = await db.all(getTweets);
  res.send(tweets);
});

//POST user Tweets
app.post("/user/tweets/", authenticate, async (req, res) => {
  const { tweet } = req.body;
  const userId = req.userId;
  const postTweetQuery = `
    INSERT INTO tweet(tweet,user_id)
    VALUES('${tweet}',${userId})
    `;
  await db.run(postTweetQuery);
  res.send("Created a Tweet");
});

//DELETE user Tweets
app.delete("/tweets/:tweetId", authenticate, async (req, res) => {
  const userId = req.userId;
  const { tweetId } = req.params;
  const tweetUser = await db.get(
    `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`
  );
  if (userId === tweetUser.user_id) {
    const DeleteTweet = `
      DELETE FROM tweet
      WHERE tweet_id = ${tweetId};
      `;
    await db.run(DeleteTweet);
    res.send("Tweet Removed");
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
});

//MiddleWare Function
const checkFollower = async (req, res, next) => {
  const { tweetId } = req.params;
  const userId = req.userId;
  const getFollowingList = `
  SELECT user_id FROM user JOIN follower ON user.user_id = follower.following_user_id WHERE follower.follower_user_id = ${userId};
  `;
  followingList = await db.all(getFollowingList);
  const following = [];
  followingList.map((followingObj) => {
    following.push(followingObj.user_id);
  });
  const getTweetUserId = `
  SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};
  `;
  const TweetUserDetails = await db.get(getTweetUserId);
  const TweetedUserId = TweetUserDetails.user_id;
  if (following.includes(TweetedUserId)) {
    next();
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
};

//Get Tweets API
app.get("/tweets/:tweetId/", authenticate, checkFollower, async (req, res) => {
  const { tweetId } = req.params;
  const getTweetDetails = `
    SELECT tweet.tweet, 
    COUNT(like.user_id) AS likes,
    COUNT(like.user_id) AS replies,
    tweet.date_time AS dateTime
    FROM
    (tweet JOIN like ON tweet.tweet_id = like.tweet_id) AS T JOIN reply ON T.tweet_id = reply.tweet_id    
    WHERE
    tweet.tweet_id = 1
    GROUP BY tweet.tweet_id;
    `;
  const tweet = await db.get(getTweetDetails);
  res.send(tweet);
});

//Get Tweet Likes API
app.get(
  "/tweets/:tweetId/likes/",
  authenticate,
  checkFollower,
  async (req, res) => {
    const { tweetId } = req.params;
    const getLikesList = `
    SELECT username FROM 
    (tweet JOIN like ON tweet.tweet_id = like.tweet_id) AS T JOIN user ON T.user_id = user.user_id
    WHERE tweet.tweet_id = ${tweetId}; 
    `;
    const likesList = await db.all(getLikesList);
    const likesArray = [];
    likesList.map((likes) => likesArray.push(likes.username));
    console.log(likesArray);
    res.send({ likes: likesArray });
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticate,
  checkFollower,
  async (req, res) => {
    const { tweetId } = req.params;
    const getRepliesList = `
    SELECT user.name,reply.reply
    FROM (tweet JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T JOIN user ON T.user_id = user.user_id
    WHERE tweet.tweet_id = ${tweetId};
    `;
    const repliesList = await db.all(getRepliesList);
    res.send({ replies: repliesList });
  }
);
module.exports = app;
