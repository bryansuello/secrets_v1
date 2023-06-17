require('dotenv').config();
console.log(process.env); // remove this after you've confirmed it is working
const express = require("express");
const ejs = require("ejs");
const mongoose = require('mongoose');
//const encrypt = require('mongoose-encryption');
//const md5 = require('md5');
// const bcrypt = require('bcrypt');
// const saltRounds = 10;
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');

const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use(session({
  secret: "Our little secret.",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://127.0.0.1:27017/userDB", {
  useNewUrlParser: true
});

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  googleId: String,
  secret: String
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

//const secret = "Thisisourlittlesecret."; // in .env
//userSchema.plugin(encrypt, { secret: process.env.SECRET, encryptedFields: ['password'] });

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());
// passport.serializeUser(User.serializeUser());
// passport.deserializeUser(User.deserializeUser());

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id)
    .then(user => {
      done(null, user);
    })
    .catch(err => {
      done(err, null);
    });
});

passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: "https://localhost:3000/auth/google/secrets",
  userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo' // google+ bug fix prevention
},
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ googleId: profile.id }, function(err, user) {
      return cb(err, user);
    });
  }
));

//TODO

app.get('/', (req, res) => {
  res.render('home');
})

app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] })); //should be this format

app.get('/auth/google/secrets',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // successful authentication, redirect to secrets
    res.redirect('/secrets');
  });


app.route('/register')
  .get((req, res) => {
    res.render('register');
  })
  .post((req, res) => {
    // bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
    //   // Store hash in your password DB.
    //   const newUser = new User({
    //     email: req.body.username,
    //     //password: md5(req.body.password) // md5
    //     password: hash
    //   });
    //   newUser.save()
    //     .then(() => {
    //       res.render('secrets');
    //     })
    //     .catch((err) => {
    //       console.log(err);
    //     })
    // });
    User.register({ username: req.body.username }, req.body.password, (err, user) => {
      if (err) {
        console.log(err);
        res.redirect('/register');
      } else {
        passport.authenticate('local')(req, res, () => {
          res.redirect('/secrets');
        })
      }
    });
  });

app.route('/secrets')
  .get((req, res) => {
    // if (req.isAuthenticated()) {
    //   res.render('secrets');
    // } else {
    //   res.redirect('/login');
    // }
    User.find({ 'secret': { $ne: null } })
      .then(foundUsers => {
        res.render('secrets', { usersWithSecrets: foundUsers });
      })
      .catch(err => {
        console.log(err);
      });
  });


app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', (req, res) => {
  // const username = req.body.username;
  // const password = req.body.password;

  // User.findOne({ email: username })
  //   .then((foundUser) => {
  //     bcrypt.compare(password, foundUser.password, (err, result) => {
  //       if (result === true) {
  //         res.render('secrets');
  //       }
  //     });
  //   })
  //   .catch(err => {
  //     console.log(err);
  //   })
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });

  req.login(user, (err) => {
    if (err) {
      console.log(err);
    } else {
      passport.authenticate('local')(req, res, () => {
        res.redirect('/secrets');
      })
    }
  })
});

app.route('/logout')
  .get((req, res, next) => {
    req.logout((err) => {
      // if (err) {
      //   return next(err);
      // }
      err ? next(err) : null;
      res.redirect('/');
    });
  });


// Add this middleware function before the /submit route
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

// Update the /submit routeensureAuthenticated,  to use the ensureAuthenticated middleware
app.route('/submit')
  .get(ensureAuthenticated, (req, res) => {
    if (req.isAuthenticated()) {
      res.render('submit');
    } else {
      res.redirect('/login');
    }
  })
  .post((req, res) => {
    const submittedSecret = req.body.secret;
    User.findById(req.user.id)
      .then(foundUser => {
        foundUser.secret = submittedSecret;
        return foundUser.save();
      })
      .then(() => {
        res.redirect('/secrets');
      })
      .catch(err => {
        console.log(err);
      });
  });


app.listen(3000, function() {
  console.log("Server started on port 3000");
});
