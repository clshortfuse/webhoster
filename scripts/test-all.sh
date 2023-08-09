echo . \
  & sh -c ". ~/.nvm/nvm.sh; nvm install 16.13; nvm use 16.13; npx c8 --clean false -r none ava;" \
  & sh -c ". ~/.nvm/nvm.sh; nvm install 16; nvm use 16; npx c8 --clean false -r none ava;" \
  & sh -c ". ~/.nvm/nvm.sh; nvm install 18; nvm use 18; npx c8 --clean false -r none ava;" \
  & sh -c ". ~/.nvm/nvm.sh; nvm install 20; nvm use 20; npx c8 --clean false -r none ava;" \
  