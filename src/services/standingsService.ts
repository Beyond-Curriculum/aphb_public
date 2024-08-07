import Standings, { IStandings } from '../models/standingsModel';
import Battles, { IBattles } from '../models/battlesModel';
import { CreateStandingDto } from '../dtos/CreateStanding.dot';
import { getNearestStandings, getSortedStandings } from '../utils';


class StandingsService {

	async getStandings() {
		return await Standings.find().exec();
	}
	
	async getStandingsByLeague(league: string) {
		return await getSortedStandings(league);
	}
	
	async createStanding (standing: CreateStandingDto) {
		const { name, league, qualPoints } = standing;
		const newStanding = new Standings({ name, league, qualPoints });
		return await newStanding.save();
	}
	
	async bulkInsertStandings(standings: CreateStandingDto[]) {
		return await Standings.insertMany(standings);
	}
	
	async calculateBuhgolts(teamId: string): Promise<number> {
		// 1. Find all battles for the given team
		// populate teams and team.specificTeams for each team
		const battles: IBattles[] = await Battles.find({ teams: teamId })
		.populate('teams')
		.populate('jury.specificTeams')
		.exec();
		console.log(battles.map(battle => battle.teams.map(team => team.specificTeams)));
		// 2. Extract opponent from each battle, it can either be a team or jury
		const opponents: IStandings[][] = battles.map(battle => {
			if (battle.jury) {
				return battle.jury.specificTeams;
			}
			return battle.teams.filter(team => team.id !== teamId);
		});
		const buhgolts: number[] = [];
		for (let i = 0; i < opponents.length; i++) {
			let acc = 0;
			for (let j = 0; j < opponents[i].length; j++) {
				if (opponents[i][j].disqualified) {
					// populate specificTeams for each team
					const populatedTeam = await opponents[i][j].populate('specificTeams');
					console.log(populatedTeam);
					opponents[i][j].total = opponents[i][j].specificTeams.reduce((acc, t) => acc + t.total, 0) / opponents[i][j].specificTeams.length;
				}
				acc += opponents[i][j].total;
			}
			buhgolts.push(acc / opponents[i].length);
		}
		
		// 3. Calculate and return the total Buhgolts coefficient (sum of opponent totals). for each element in opponents find average of total
		// const buhgolts = opponents.map(async opponent => {
		// 	const total = opponent.reduce(async (acc, team) => {
		// 		let opponentScore = team.total;
		// 		if (team.disqualified)
		// 			{
		// 				// populate specificTeams for each team
		// 				const populatedTeam = await team.populate('specificTeams');
		// 				console.log(populatedTeam);
		// 				opponentScore = team.specificTeams.reduce((acc, t) => acc + t.total, 0) / team.specificTeams.length;
		// 		}
		// 		return acc + opponentScore;
		// 	}, 0);
		// 	return total / opponent.length;
		// });
	
		return buhgolts.reduce((acc, buhgolt) => acc + buhgolt, 0);
	}
	
	async updateStandingTotal(standingId: string) {
		const standing = await Standings.findById(standingId).exec();
		if (!standing) {
			throw new Error('Standing not found');
		}
		const battles = await Battles.find({ teams: standingId }).exec();
		const points = battles.reduce((acc, battle) => {
			// find the index of the team in the battle
			const index = battle.teams.findIndex(team => team.id === standingId);
			// add the points for the team in the battle
			return acc + battle.points[index];
		}, 0);
		standing.total += points;
		standing.tours[standing.tours.length - 1].points += points;
		return await standing.save();
	}
	
	async updateStandingBuhgolts(standingId: string) {
		const standing = await Standings.findById(standingId).exec();
		if (!standing) {
			throw new Error('Standing not found');
		}
		standing.tours[standing.tours.length - 1].CB = await this.calculateBuhgolts(standing.id);
		return await standing.save();
	}
	
	async disqualifyStanding(standingId: string) {
		const standing = await Standings.findById(standingId).exec();
		if (!standing) {
			throw new Error('Standing not found');
		}
		standing.disqualified = true;
	
		const specificTeams = await getNearestStandings(standing, 3);
	
		standing.specificTeams = specificTeams || [];
	
		return await standing.save();
	}
	
	async startNewTour(league: string) {
		const standings = await this.getStandingsByLeague(league);
		const newTour = standings[0].tours.length + 1;
		standings.forEach(async standing => {
			standing.tours.push({ number: newTour, points: 0, CB: 0 });
			await standing.save();
		});
		return newTour;
	}
}

export default StandingsService;